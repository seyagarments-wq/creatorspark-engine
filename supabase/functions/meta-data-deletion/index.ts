import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getSecret } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[META-DATA-DELETION] ${step}${detailsStr}`);
};

const logError = (step: string, error: unknown) => {
  const errorDetails = error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error };
  console.error(`[META-DATA-DELETION] ERROR: ${step}`, JSON.stringify(errorDetails));
};

// Store deletion requests for status tracking
interface DeletionRecord {
  userId: string;
  confirmationCode: string;
  requestedAt: string;
  status: "pending" | "completed" | "failed";
  completedAt?: string;
}

// In-memory store for deletion tracking (in production, this should be in the database)
const deletionRecords = new Map<string, DeletionRecord>();

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle GET requests for status checks
  if (req.method === "GET") {
    const url = new URL(req.url);
    const confirmationCode = url.searchParams.get("code");
    
    if (confirmationCode) {
      const record = deletionRecords.get(confirmationCode);
      if (record) {
        return new Response(
          JSON.stringify({
            confirmation_code: confirmationCode,
            status: record.status,
            requested_at: record.requestedAt,
            completed_at: record.completedAt,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Not found",
          message: "Deletion request not found. It may have already been processed." 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Only accept POST requests for deletion callbacks
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    logStep("Data deletion request received");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = (await getSecret("SITE_URL")) || "https://creatorsctrl.com";

    // Parse the request body - Facebook sends form-encoded data
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
        JSON.stringify({ error: "Missing signed_request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the signed request (Facebook format: signature.payload)
    const [, payload] = signedRequest.split(".");
    
    if (!payload) {
      return new Response(
        JSON.stringify({ error: "Invalid signed_request format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const decodedPayload = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const userId = decodedPayload.user_id;

    if (!userId) {
      logStep("No user_id in request");
      return new Response(
        JSON.stringify({ error: "No user_id in request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Processing data deletion", { userId });

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // Generate a unique confirmation code for this deletion request
    const confirmationCode = crypto.randomUUID();
    const requestedAt = new Date().toISOString();

    // Store the deletion record for status tracking
    deletionRecords.set(confirmationCode, {
      userId,
      confirmationCode,
      requestedAt,
      status: "pending",
    });

    // Find and clear ALL data associated with this Facebook/Instagram user
    // 1. Clear profile Instagram data
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
        social_handles: null,
      })
      .eq("instagram_user_id", userId)
      .select("id");

    if (updateError) {
      logError("Error clearing Instagram data from profiles", updateError);
      deletionRecords.set(confirmationCode, {
        ...deletionRecords.get(confirmationCode)!,
        status: "failed",
      });
    } else {
      deletionRecords.set(confirmationCode, {
        ...deletionRecords.get(confirmationCode)!,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    }

    const affectedProfiles = updatedProfiles?.length || 0;
    logStep("Data deletion completed", { 
      userId, 
      confirmationCode, 
      affectedProfiles 
    });

    // Facebook expects a specific response format with:
    // - url: Where users can check their deletion status
    // - confirmation_code: Unique tracking code
    const statusUrl = `${siteUrl}/data-deletion?code=${confirmationCode}`;

    return new Response(
      JSON.stringify({
        url: statusUrl,
        confirmation_code: confirmationCode,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    logError("Unhandled exception", error);
    
    // Generate a confirmation code even for errors
    // Facebook requires this response format
    const errorConfirmationCode = crypto.randomUUID();
    const siteUrl = (await getSecret("SITE_URL")) || "https://creatorsctrl.com";
    
    return new Response(
      JSON.stringify({
        url: `${siteUrl}/data-deletion?code=${errorConfirmationCode}&status=error`,
        confirmation_code: errorConfirmationCode,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
