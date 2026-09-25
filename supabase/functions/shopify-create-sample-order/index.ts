import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyFetch } from "../_shared/shopify.ts";
import { HttpError } from "../_shared/payout-guard.ts";
import { requirePayoutCaller } from "../_shared/payout-auth.ts";
import {
  activeItems,
  approvalMessage,
  buildSampleDraftOrder,
  isOwnDraft,
  itemLabel,
  itemsSummary,
  requestItems,
  STALE_CLAIM_MS,
  type SampleItem,
} from "../_shared/sample-order.ts";

// Free Shopify orders are only placed where the edge secret SAMPLE_ORDERS_LIVE is exactly
// "true" (production). Everywhere else every call is a dry run that returns the payload. Read
// from Deno.env on purpose, so the in-app Setup page can't flip it.
const ordersLive = () => Deno.env.get("SAMPLE_ORDERS_LIVE") === "true";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to wait
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Complete draft order with retry logic for async calculation
async function completeDraftOrder(
  draftOrderId: number,
  maxRetries: number = 3
): Promise<number | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Completing draft order attempt ${attempt}/${maxRetries}`);
    
    const response = await shopifyFetch(`draft_orders/${draftOrderId}/complete.json`, {
      method: "PUT",
      body: JSON.stringify({ payment_pending: false }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.draft_order?.order_id || null;
    }

    const errorText = await response.text();
    console.log(`Attempt ${attempt} failed: ${response.status} - ${errorText}`);

    // Check if it's the "not finished calculating" error
    if (response.status === 422 && errorText.includes("not finished calculating")) {
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff: 1s, 2s, 4s)
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
        continue;
      }
    }

    // For other errors or max retries reached, throw
    throw new Error(`Failed to complete draft order after ${attempt} attempts: ${response.status} - ${errorText}`);
  }

  throw new Error("Max retries reached");
}

/** A draft order as Shopify has it now, or null if it's gone. */
async function getDraftOrder(
  draftOrderId: string | number,
): Promise<{ id: number; order_id: number | null; status: string; note: string | null; tags: string | null } | null> {
  const res = await shopifyFetch(`draft_orders/${draftOrderId}.json?fields=id,order_id,status,note,tags`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't read draft order ${draftOrderId}: ${res.status} - ${await res.text()}`);
  return (await res.json()).draft_order ?? null;
}

/**
 * Each item's variant must exist and belong to the product it claims to. The creator's browser
 * supplies these ids, and the one-size-per-product rule is only as good as the product ids.
 */
async function verifyItemsAgainstShopify(items: SampleItem[]) {
  for (const i of items) {
    const res = await shopifyFetch(`variants/${i.shopify_variant_id}.json?fields=id,product_id`);
    if (res.status === 404) throw new HttpError(409, `${itemLabel(i)} no longer exists in Shopify. Drop it and approve again.`);
    if (!res.ok) throw new Error(`Couldn't check ${itemLabel(i)} in Shopify: ${res.status} - ${await res.text()}`);
    const variant = (await res.json()).variant;
    if (String(variant?.product_id) !== i.shopify_product_id) {
      throw new HttpError(409, `${itemLabel(i)} doesn't match Shopify (that size belongs to a different product). Drop it or reject the request.`);
    }
  }
}

/** "#1234". The draft's own name is "#D12", which isn't what shows in the Orders list. */
async function orderName(orderId: number): Promise<string | null> {
  try {
    const res = await shopifyFetch(`orders/${orderId}.json?fields=name`);
    return res.ok ? ((await res.json()).order?.name ?? null) : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // The exact claim this call holds, so an error only ever releases its own claim.
  let myClaim: { id: string; at: string } | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    // verify_jwt is off for this function, so this is its only gate: admins only.
    await requirePayoutCaller(req, supabase);

    const { sampleRequestId, dryRun: askedDryRun, takeOver } = await req.json().catch(() => ({}));
    if (typeof sampleRequestId !== "string" || !sampleRequestId) throw new HttpError(400, "sampleRequestId is required");
    const dryRun = askedDryRun === true || !ordersLive();

    const { data: sampleRequest, error: fetchError } = await supabase
      .from("sample_requests")
      .select("*, creator:profiles(full_name, email), items:sample_request_items(*)")
      .eq("id", sampleRequestId)
      .maybeSingle();
    if (fetchError) throw new Error(`Sample request lookup failed: ${fetchError.message}`);
    if (!sampleRequest) throw new HttpError(404, "Sample request not found");
    if (sampleRequest.status !== "requested" || sampleRequest.shopify_order_id) {
      throw new HttpError(409, `This request is already ${sampleRequest.shopify_order_id ? "ordered" : sampleRequest.status}.`);
    }

    const items: SampleItem[] = requestItems(sampleRequest, sampleRequest.items);
    if (activeItems(items).length === 0) throw new HttpError(400, "This request has no items left to order. Reject it instead.");
    const draftOrderPayload = buildSampleDraftOrder(sampleRequest, sampleRequest.creator, items);

    if (dryRun) {
      return json({
        success: true,
        dryRun: true,
        reason: askedDryRun === true ? "Dry run requested." : "SAMPLE_ORDERS_LIVE is not set on this project, so no Shopify order was created.",
        lineCount: draftOrderPayload.draft_order.line_items.length,
        payload: draftOrderPayload,
      });
    }

    // Claim before touching Shopify. Only one call can win this update, so a double click or a
    // replayed request can never create a second free order. A claim older than STALE_CLAIM_MS is
    // a dead call; an admin can take it over (takeOver), atomically, in the same update.
    const claimAt = new Date().toISOString();
    let claimQuery = supabase
      .from("sample_requests")
      .update({ shopify_order_claimed_at: claimAt })
      .eq("id", sampleRequestId)
      .eq("status", "requested")
      .is("shopify_order_id", null);
    claimQuery = takeOver === true
      ? claimQuery.or(`shopify_order_claimed_at.is.null,shopify_order_claimed_at.lt.${new Date(Date.now() - STALE_CLAIM_MS).toISOString()}`)
      : claimQuery.is("shopify_order_claimed_at", null);
    const { data: claimed, error: claimError } = await claimQuery.select("id");
    if (claimError) throw new Error(`Could not claim the request: ${claimError.message}`);
    if (!claimed || claimed.length === 0) {
      throw new HttpError(409, "An order for this request is already being placed. Give it a few minutes, then refresh.");
    }
    myClaim = { id: sampleRequestId, at: claimAt };

    // Idempotency: a previous attempt may have left a draft. If Shopify already turned it into an
    // order (the reply was lost, or the function died after completing), record that order
    // instead of placing a second one. An open leftover draft is deleted and rebuilt, because
    // the admin may have dropped items since.
    let orderId: number | null = null;
    let draftId: number | null = null;
    if (sampleRequest.shopify_draft_order_id) {
      const found = await getDraftOrder(sampleRequest.shopify_draft_order_id);
      // Only a draft this function made for this request counts. Anything else is ignored, never
      // recorded as this request's order and never deleted.
      const previous = found && isOwnDraft(found, sampleRequestId) ? found : null;
      if (found && !previous) console.warn(`Draft ${found.id} on request ${sampleRequestId} isn't a sample draft for it; ignoring`);
      if (previous?.order_id) {
        orderId = previous.order_id;
        draftId = previous.id;
        console.log(`Draft ${previous.id} was already completed as order ${orderId}; recording it`);
      } else if (previous && previous.status !== "completed") {
        await shopifyFetch(`draft_orders/${previous.id}.json`, { method: "DELETE" }).catch((e) =>
          console.warn(`Couldn't delete leftover draft ${previous.id}:`, e),
        );
      }
    }

    if (!orderId) {
      await verifyItemsAgainstShopify(activeItems(items));
      console.log(`Creating Shopify order for sample request ${sampleRequestId} (${draftOrderPayload.draft_order.line_items.length} lines)`);
      const draftOrderResponse = await shopifyFetch("draft_orders.json", {
        method: "POST",
        body: JSON.stringify(draftOrderPayload),
      });
      if (!draftOrderResponse.ok) {
        const errorText = await draftOrderResponse.text();
        throw new Error(`Failed to create draft order: ${draftOrderResponse.status} - ${errorText}`);
      }
      draftId = (await draftOrderResponse.json()).draft_order.id as number;
      // Remember the draft before completing it, so a retry can find out what happened to it.
      await supabase.from("sample_requests").update({ shopify_draft_order_id: String(draftId) }).eq("id", sampleRequestId);

      // Wait a moment for Shopify to finish calculations
      await sleep(1000);
      try {
        orderId = await completeDraftOrder(draftId, 3);
      } catch (completeError) {
        // The error may have come after Shopify completed it. Ask before calling it a failure.
        const now = await getDraftOrder(draftId).catch(() => null);
        if (!now?.order_id) throw completeError;
        orderId = now.order_id;
      }
      if (!orderId) {
        const now = await getDraftOrder(draftId).catch(() => null);
        orderId = now?.order_id ?? null;
      }
      if (!orderId) throw new Error(`Shopify completed draft ${draftId} but returned no order id`);
    }

    // The order exists now. From here on the claim stays, even on error, so nobody retries into
    // a duplicate; the error below names the order to look for.
    myClaim = null;
    const name = await orderName(orderId);
    console.log("Order created:", orderId, name);

    const { error: updateError } = await supabase
      .from("sample_requests")
      .update({
        shopify_draft_order_id: draftId ? String(draftId) : sampleRequest.shopify_draft_order_id,
        shopify_order_id: String(orderId),
        shopify_order_name: name,
        status: "approved",
      })
      .eq("id", sampleRequestId);
    if (updateError) {
      throw new Error(`Shopify order ${name ?? orderId} was created but saving it failed: ${updateError.message}`);
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", sampleRequest.creator_id)
        .maybeSingle();

      if (profile?.user_id) {
        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            user_id: profile.user_id,
            title: activeItems(items).length > 1 ? "Sample order approved" : "Sample request approved",
            message: approvalMessage(items),
            notification_type: "general",
            link: "/creator/samples",
            button_text: "View request",
          }),
        });
      }
    } catch (notifyError) {
      // Don't fail the whole approval if notification fails
      console.error("Failed to send approval notification:", notifyError);
    }

    return json({
      success: true,
      dryRun: false,
      draftOrderId: draftId,
      orderId,
      orderName: name,
      summary: itemsSummary(activeItems(items)),
      lineCount: draftOrderPayload.draft_order.line_items.length,
    });
  } catch (error: unknown) {
    // Shopify never completed an order: release the claim so the admin can retry.
    if (myClaim) {
      await supabase
        .from("sample_requests")
        .update({ shopify_order_claimed_at: null })
        .eq("id", myClaim.id)
        .eq("shopify_order_claimed_at", myClaim.at);
    }
    const status = error instanceof HttpError ? error.status : 500;
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in shopify-create-sample-order:", error);
    return json({ error: errorMessage }, status);
  }
});
