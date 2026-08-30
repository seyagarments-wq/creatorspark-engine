import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Meta API error codes
const META_ERROR_CODES = {
  EXPIRED_TOKEN: 190,
  RATE_LIMIT: 80004,
  MISSING_PERMISSIONS: 200,
  INVALID_PARAMETER: 100,
  API_SESSION: 102,
};

interface TokenValidationResult {
  valid: boolean;
  account_name?: string;
  account_status?: number;
  permissions?: string[];
  expires_at?: string;
  error_code?: string;
  error_message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log("Validating Meta token...");

    // Fetch Meta credentials
    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({
          valid: false,
          error_code: "NO_CREDENTIALS",
          error_message: "Meta Ads not connected. Please connect your account in Settings.",
        } as TokenValidationResult),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id, expires_at } = credentials;

    if (!access_token || !ad_account_id) {
      return new Response(
        JSON.stringify({
          valid: false,
          error_code: "INCOMPLETE_CREDENTIALS",
          error_message: "Missing access token or ad account ID.",
        } as TokenValidationResult),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired based on stored expiry
    if (expires_at && new Date(expires_at) < new Date()) {
      await supabase
        .from("meta_credentials")
        .update({ status: "expired" })
        .eq("id", credentials.id);

      return new Response(
        JSON.stringify({
          valid: false,
          error_code: "TOKEN_EXPIRED",
          error_message: "Access token has expired. Please reconnect your Meta account.",
          expires_at,
        } as TokenValidationResult),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountId = ad_account_id.replace("act_", "");

    // Step 1: Validate token by fetching account info
    const accountUrl = `https://graph.facebook.com/v21.0/act_${accountId}?fields=name,account_status,business,currency&access_token=${access_token}`;
    
    const accountResponse = await fetch(accountUrl);
    const accountData = await accountResponse.json();

    if (accountData.error) {
      const errorCode = accountData.error.code;
      let errorMessage = accountData.error.message;
      let userFriendlyCode = "API_ERROR";

      if (errorCode === META_ERROR_CODES.EXPIRED_TOKEN) {
        userFriendlyCode = "TOKEN_EXPIRED";
        errorMessage = "Access token has expired. Please reconnect your Meta account.";
        
        await supabase
          .from("meta_credentials")
          .update({ status: "expired" })
          .eq("id", credentials.id);
      } else if (errorCode === META_ERROR_CODES.MISSING_PERMISSIONS) {
        userFriendlyCode = "MISSING_PERMISSIONS";
        errorMessage = "Token is missing required permissions. Ensure ads_management and ads_read are granted.";
      } else if (errorCode === META_ERROR_CODES.RATE_LIMIT) {
        userFriendlyCode = "RATE_LIMITED";
        errorMessage = "API rate limit reached. Please try again later.";
      }

      // Log the error
      await supabase.from("meta_api_logs").insert({
        function_name: "validate-meta-token",
        error_code: errorCode,
        error_type: accountData.error.type,
        error_message: accountData.error.message,
        error_subcode: accountData.error.error_subcode,
        fbtrace_id: accountData.error.fbtrace_id,
        request_url: accountUrl.replace(access_token, "[REDACTED]"),
        response_data: accountData.error,
      });

      return new Response(
        JSON.stringify({
          valid: false,
          error_code: userFriendlyCode,
          error_message: errorMessage,
        } as TokenValidationResult),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Check token permissions via debug_token endpoint
    const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${access_token}&access_token=${access_token}`;
    
    const debugResponse = await fetch(debugUrl);
    const debugData = await debugResponse.json();

    let permissions: string[] = [];
    let tokenExpiresAt: string | undefined;

    if (debugData.data) {
      permissions = debugData.data.scopes || [];
      
      if (debugData.data.expires_at && debugData.data.expires_at > 0) {
        tokenExpiresAt = new Date(debugData.data.expires_at * 1000).toISOString();
        
        // Update expiry in database if different
        if (tokenExpiresAt !== expires_at) {
          await supabase
            .from("meta_credentials")
            .update({ expires_at: tokenExpiresAt })
            .eq("id", credentials.id);
        }
      }
    }

    // Check for required permissions
    const requiredPermissions = ["ads_management", "ads_read", "business_management"];
    const missingPermissions = requiredPermissions.filter(p => !permissions.includes(p));

    if (missingPermissions.length > 0) {
      console.log(`Missing permissions: ${missingPermissions.join(", ")}`);
    }

    console.log(`Token valid for account: ${accountData.name}`);

    return new Response(
      JSON.stringify({
        valid: true,
        account_name: accountData.name,
        account_status: accountData.account_status,
        permissions,
        missing_permissions: missingPermissions.length > 0 ? missingPermissions : undefined,
        expires_at: tokenExpiresAt || expires_at,
        currency: accountData.currency,
        business: accountData.business?.name,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error validating Meta token:", error);
    
    return new Response(
      JSON.stringify({
        valid: false,
        error_code: "CONNECTION_ERROR",
        error_message: "Failed to connect to Meta API. Please check your internet connection.",
      } as TokenValidationResult),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
