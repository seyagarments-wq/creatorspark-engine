import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(): Promise<string> {
  const shopDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");

  if (!shopDomain || !clientId || !clientSecret) {
    throw new Error("Missing Shopify credentials");
  }

  const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Helper function to wait
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Complete draft order with retry logic for async calculation
async function completeDraftOrder(
  shopDomain: string,
  accessToken: string,
  draftOrderId: number,
  maxRetries: number = 3
): Promise<{ orderId: number | null; orderName: string | null }> {
  const completeUrl = `https://${shopDomain}/admin/api/2024-01/draft_orders/${draftOrderId}/complete.json`;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Completing draft order attempt ${attempt}/${maxRetries}`);
    
    const response = await fetch(completeUrl, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment_pending: false,
      }),
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { sampleRequestId } = await req.json();

    if (!sampleRequestId) {
      throw new Error("sampleRequestId is required");
    }

    console.log("Creating Shopify order for sample request:", sampleRequestId);

    // Fetch the sample request with creator info
    const { data: sampleRequest, error: fetchError } = await supabase
      .from("sample_requests")
      .select(`
        *,
        creator:profiles(full_name, email)
      `)
      .eq("id", sampleRequestId)
      .single();

    if (fetchError || !sampleRequest) {
      throw new Error(`Sample request not found: ${fetchError?.message}`);
    }

    if (!sampleRequest.shopify_variant_id) {
      throw new Error("No Shopify variant selected for this sample request");
    }

    const shopDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    if (!shopDomain) {
      throw new Error("SHOPIFY_STORE_DOMAIN not configured");
    }

    const accessToken = await getAccessToken();

    // Build shipping address
    const shippingAddress = {
      first_name: sampleRequest.creator?.full_name?.split(" ")[0] || "Creator",
      last_name: sampleRequest.creator?.full_name?.split(" ").slice(1).join(" ") || "",
      address1: sampleRequest.shipping_address,
      city: sampleRequest.shipping_city || "",
      province: sampleRequest.shipping_state || "",
      zip: sampleRequest.shipping_zip || "",
      country: sampleRequest.shipping_country || "US",
    };

    // Create draft order with 100% discount (free sample)
    const draftOrderPayload = {
      draft_order: {
        line_items: [
          {
            variant_id: parseInt(sampleRequest.shopify_variant_id),
            quantity: 1,
          },
        ],
        shipping_address: shippingAddress,
        billing_address: shippingAddress,
        email: sampleRequest.creator?.email,
        note: `Sample request for creator: ${sampleRequest.creator?.full_name}. Product: ${sampleRequest.shopify_product_title}`,
        applied_discount: {
          description: "Creator Sample - 100% Off",
          value_type: "percentage",
          value: "100.0",
          title: "PROMO20",
        },
        use_customer_default_address: false,
        tags: "creator-sample,promo20",
      },
    };

    console.log("Creating draft order with 100% discount...");

    const draftOrderUrl = `https://${shopDomain}/admin/api/2024-01/draft_orders.json`;
    
    const draftOrderResponse = await fetch(draftOrderUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(draftOrderPayload),
    });

    if (!draftOrderResponse.ok) {
      const errorText = await draftOrderResponse.text();
      console.error("Shopify draft order error:", draftOrderResponse.status, errorText);
      throw new Error(`Failed to create draft order: ${draftOrderResponse.status} - ${errorText}`);
    }

    const draftOrderData = await draftOrderResponse.json();
    const draftOrder = draftOrderData.draft_order;

    console.log("Draft order created:", draftOrder.id, "- Now completing to create live order...");

    // Wait a moment for Shopify to finish calculations
    await sleep(1000);

    // Complete the draft order with retry logic
    const { orderId, orderName } = await completeDraftOrder(
      shopDomain,
      accessToken,
      draftOrder.id,
      3
    );

    console.log("Order created successfully:", orderId, orderName);

    // Update the sample request with order info
    const { error: updateError } = await supabase
      .from("sample_requests")
      .update({
        shopify_draft_order_id: draftOrder.id.toString(),
        shopify_order_id: orderId?.toString() || null,
        status: "approved",
      })
      .eq("id", sampleRequestId);

    if (updateError) {
      console.error("Failed to update sample request:", updateError);
      throw new Error(`Failed to update sample request: ${updateError.message}`);
    }

    // Send approval notification email to creator (server-side for reliability)
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", sampleRequest.creator_id)
        .maybeSingle();

      if (profile?.user_id) {
        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: profile.user_id,
            title: "Sample request approved",
            message: `Your request for "${sampleRequest.product_name}" has been approved. Shipping details will follow shortly. Begin planning your content now so you are ready to film once it arrives.`,
            notification_type: "general",
            link: "/creator/samples",
            button_text: "View request",
          }),
        });
        console.log("Approval notification dispatched to user:", profile.user_id);
      }
    } catch (notifyError) {
      // Don't fail the whole approval if notification fails
      console.error("Failed to send approval notification:", notifyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        draftOrderId: draftOrder.id,
        orderId: orderId,
        orderName: orderName,
        invoiceUrl: draftOrder.invoice_url,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in shopify-create-sample-order:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
