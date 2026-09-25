import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyFetch } from "../_shared/shopify.ts";
import { HttpError } from "../_shared/payout-guard.ts";
import { requirePayoutCaller } from "../_shared/payout-auth.ts";
import {
  activeItems,
  approvalMessage,
  buildSampleDraftOrder,
  itemsSummary,
  requestItems,
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
): Promise<{ orderId: number | null; orderName: string | null }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Completing draft order attempt ${attempt}/${maxRetries}`);
    
    const response = await shopifyFetch(`draft_orders/${draftOrderId}/complete.json`, {
      method: "PUT",
      body: JSON.stringify({ payment_pending: false }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        orderId: data.draft_order?.order_id || null,
        orderName: data.draft_order?.name || null,
      };
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let claimedId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    // verify_jwt is off for this function, so this is its only gate: admins only.
    await requirePayoutCaller(req, supabase);

    const { sampleRequestId, dryRun: askedDryRun } = await req.json().catch(() => ({}));
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
    // replayed request can never create a second free order.
    const { data: claimed, error: claimError } = await supabase
      .from("sample_requests")
      .update({ shopify_order_claimed_at: new Date().toISOString() })
      .eq("id", sampleRequestId)
      .eq("status", "requested")
      .is("shopify_order_claimed_at", null)
      .is("shopify_order_id", null)
      .select("id");
    if (claimError) throw new Error(`Could not claim the request: ${claimError.message}`);
    if (!claimed || claimed.length === 0) {
      throw new HttpError(409, "An order for this request is already in progress. Check Shopify before trying again.");
    }
    claimedId = sampleRequestId;

    console.log(`Creating Shopify order for sample request ${sampleRequestId} (${draftOrderPayload.draft_order.line_items.length} lines)`);
    const draftOrderResponse = await shopifyFetch("draft_orders.json", {
      method: "POST",
      body: JSON.stringify(draftOrderPayload),
    });
    if (!draftOrderResponse.ok) {
      const errorText = await draftOrderResponse.text();
      throw new Error(`Failed to create draft order: ${draftOrderResponse.status} - ${errorText}`);
    }
    const draftOrder = (await draftOrderResponse.json()).draft_order;

    // Wait a moment for Shopify to finish calculations
    await sleep(1000);
    const { orderId, orderName } = await completeDraftOrder(draftOrder.id, 3);
    // The order exists now. From here on the claim stays, even on error, so nobody retries into
    // a duplicate; the error below names the order to look for.
    claimedId = null;
    console.log("Order created:", orderId, orderName);

    const { error: updateError } = await supabase
      .from("sample_requests")
      .update({
        shopify_draft_order_id: draftOrder.id.toString(),
        shopify_order_id: orderId?.toString() || null,
        shopify_order_name: orderName,
        status: "approved",
      })
      .eq("id", sampleRequestId);
    if (updateError) {
      throw new Error(`Shopify order ${orderName ?? orderId} was created but saving it failed: ${updateError.message}`);
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
      draftOrderId: draftOrder.id,
      orderId,
      orderName,
      summary: itemsSummary(activeItems(items)),
      lineCount: draftOrderPayload.draft_order.line_items.length,
    });
  } catch (error: unknown) {
    // Shopify never completed an order: release the claim so the admin can retry.
    if (claimedId) {
      await supabase.from("sample_requests").update({ shopify_order_claimed_at: null }).eq("id", claimedId);
    }
    const status = error instanceof HttpError ? error.status : 500;
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in shopify-create-sample-order:", error);
    return json({ error: errorMessage }, status);
  }
});
