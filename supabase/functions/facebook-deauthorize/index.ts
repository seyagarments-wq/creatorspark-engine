import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FACEBOOK-DEAUTHORIZE] ${step}${detailsStr}`);
};

const logError = (step: string, error: unknown) => {
  const errorDetails = error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error };
  console.error(`[FACEBOOK-DEAUTHORIZE] ERROR: ${step}`, JSON.stringify(errorDetails));
};

// Verify Facebook's signed request using Web Crypto API
async function verifySignedRequest(signedRequest: string, appSecret: string): Promise<{ valid: boolean; payload?: Record<string, unknown>; error?: string }> {
  try {
    const [encodedSig, encodedPayload] = signedRequest.split(".");
    
    if (!encodedSig || !encodedPayload) {
      return { valid: false, error: "Invalid signed_request format" };
    }
    
    // Decode the payload
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
    
    // Create HMAC-SHA256 signature using Web Crypto API
    const encoder = new TextEncoder();
    const keyData = encoder.encode(appSecret);
    const messageData = encoder.encode(encodedPayload);
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", key, messageData);
    const signatureArray = new Uint8Array(signature);
    
    // Convert to base64url
    const expectedSig = btoa(String.fromCharCode(...signatureArray))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    
    const receivedSig = encodedSig.replace(/=+$/, "");
    
    if (expectedSig !== receivedSig) {
      logStep("Signature verification failed", { expected: expectedSig.substring(0, 10), received: receivedSig.substring(0, 10) });
      return { valid: false, error: "Invalid signature" };
    }
    
    return { valid: true, payload };
  } catch (e) {
    logError("Error verifying signed request", e);
    return { valid: false, error: "Failed to parse signed_request" };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests (Facebook sends POST)
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    logStep("Deauthorization webhook received");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppSecret = Deno.env.get("META_APP_SECRET");

    // Parse the request body
    let signedRequest: string | null = null;
    
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      signedRequest = formData.get("signed_request") as string;
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      signedRequest = body.signed_request;
    } else {
      // Try form data as default (Facebook's format)
      try {
        const formData = await req.formData();
        signedRequest = formData.get("signed_request") as string;
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid content type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!signedRequest) {
      logStep("Missing signed_request");
      return new Response(
        JSON.stringify({ error: "Missing signed_request parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the signed request if we have the app secret
    let userId: string | null = null;
    
    if (metaAppSecret) {
      const verification = await verifySignedRequest(signedRequest, metaAppSecret);
      if (!verification.valid) {
        logStep("Signed request verification failed", { error: verification.error });
        return new Response(
          JSON.stringify({ error: verification.error }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = verification.payload?.user_id as string;
    } else {
      // Fallback: parse without verification (not recommended for production)
      logStep("Warning: META_APP_SECRET not set, parsing without verification");
      const [, encodedPayload] = signedRequest.split(".");
      const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
      userId = payload.user_id;
    }

    if (!userId) {
      logStep("No user_id in signed_request");
      return new Response(
        JSON.stringify({ error: "No user_id in request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Processing deauthorization", { userId });

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Clear Instagram data for the matching user
    const { data: updatedProfiles, error: updateError } = await supabase
      .from("profiles")
      .update({
        instagram_user_id: null,
        instagram_username: null,
        instagram_access_token: null,
        instagram_token_expires_at: null,
        instagram_connected_at: null,
        instagram_business_account_id: null,
        partnership_ads_enabled: false,
      })
      .eq("instagram_user_id", userId)
      .select("id");

    if (updateError) {
      logError("Error clearing Instagram data", updateError);
      // Don't fail the request - Facebook expects a success response
    }

    const affectedCount = updatedProfiles?.length || 0;
    logStep("Deauthorization complete", { userId, affectedProfiles: affectedCount });

    // Facebook expects a simple success response
    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Deauthorization processed for user ${userId}`,
        affected_profiles: affectedCount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    logError("Unhandled exception", error);
    // Return success to Facebook even on internal errors
    // to prevent repeated webhook calls
    return new Response(
      JSON.stringify({ success: true, message: "Processed with errors" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
