import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OAuthRequest {
  action: "get_auth_url" | "exchange_code" | "disconnect" | "check_status";
  code?: string;
  redirectUri?: string;
}

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INSTAGRAM-OAUTH] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logStep("Missing or invalid authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth for session validation
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate JWT using getClaims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      logStep("JWT validation failed", { error: claimsError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email;
    logStep("User authenticated", { userId, email: userEmail });

    // Use service role client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get the user's profile ID using service client
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, instagram_user_id, instagram_username, instagram_connected_at, partnership_ads_enabled")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      logStep("Profile not found", { error: profileError?.message });
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Profile fetched", { profileId: profile.id });

    const { action, code, redirectUri }: OAuthRequest = await req.json();
    logStep("Action requested", { action });

    // For Instagram OAuth, we need the app credentials stored securely
    const metaAppId = Deno.env.get("META_APP_ID");
    const metaAppSecret = Deno.env.get("META_APP_SECRET");

    switch (action) {
      case "check_status": {
        return new Response(
          JSON.stringify({
            connected: Boolean(profile.instagram_user_id),
            username: profile.instagram_username,
            connectedAt: profile.instagram_connected_at,
            partnershipAdsEnabled: profile.partnership_ads_enabled,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_auth_url": {
        if (!metaAppId) {
          return new Response(
            JSON.stringify({ 
              error: "Instagram OAuth not configured",
              message: "Admin needs to configure Meta App credentials in settings" 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Required scopes for Partnership Ads
        const scopes = [
          "instagram_basic",
          "instagram_branded_content_ads_brand",
          "pages_show_list",
          "business_management",
        ].join(",");

        // State parameter to prevent CSRF
        const state = btoa(JSON.stringify({ profileId: profile.id, timestamp: Date.now() }));

        const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
        authUrl.searchParams.set("client_id", metaAppId);
        authUrl.searchParams.set("redirect_uri", redirectUri || "");
        authUrl.searchParams.set("scope", scopes);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("state", state);

        logStep("Generated auth URL", { authUrl: authUrl.toString() });

        return new Response(
          JSON.stringify({ authUrl: authUrl.toString(), state }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "exchange_code": {
        if (!code || !redirectUri) {
          return new Response(
            JSON.stringify({ error: "Code and redirect URI required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!metaAppId || !metaAppSecret) {
          return new Response(
            JSON.stringify({ error: "Meta App credentials not configured" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        logStep("Exchanging code for access token...");

        // Step 1: Exchange code for short-lived token
        const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
        tokenUrl.searchParams.set("client_id", metaAppId);
        tokenUrl.searchParams.set("client_secret", metaAppSecret);
        tokenUrl.searchParams.set("redirect_uri", redirectUri);
        tokenUrl.searchParams.set("code", code);

        const tokenResponse = await fetch(tokenUrl.toString());
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          logStep("Token exchange error", { error: tokenData.error });
          return new Response(
            JSON.stringify({ 
              error: "Failed to authenticate with Instagram",
              details: tokenData.error.message 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const shortLivedToken = tokenData.access_token;

        // Step 2: Exchange for long-lived token (60 days)
        const longTokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
        longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
        longTokenUrl.searchParams.set("client_id", metaAppId);
        longTokenUrl.searchParams.set("client_secret", metaAppSecret);
        longTokenUrl.searchParams.set("fb_exchange_token", shortLivedToken);

        const longTokenResponse = await fetch(longTokenUrl.toString());
        const longTokenData = await longTokenResponse.json();

        const accessToken = longTokenData.access_token || shortLivedToken;
        const expiresIn = longTokenData.expires_in || 5184000;

        // Step 3: Get Instagram Business Account
        const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        let instagramBusinessAccountId = null;
        let instagramUserId = null;
        let instagramUsername = null;

        if (pagesData.data && pagesData.data.length > 0) {
          for (const page of pagesData.data) {
            const igAccountUrl = `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`;
            const igResponse = await fetch(igAccountUrl);
            const igData = await igResponse.json();

            if (igData.instagram_business_account?.id) {
              instagramBusinessAccountId = igData.instagram_business_account.id;

              const igUserUrl = `https://graph.facebook.com/v19.0/${instagramBusinessAccountId}?fields=username,id&access_token=${accessToken}`;
              const igUserResponse = await fetch(igUserUrl);
              const igUserData = await igUserResponse.json();

              instagramUserId = igUserData.id;
              instagramUsername = igUserData.username;
              break;
            }
          }
        }

        if (!instagramBusinessAccountId) {
          return new Response(
            JSON.stringify({ 
              error: "No Instagram Business Account found",
              message: "Please ensure your Instagram account is connected to a Facebook Page and is a Business or Creator account." 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        logStep(`Found Instagram account: @${instagramUsername} (${instagramUserId})`);

        // Step 4: Update profile with Instagram connection
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        const { error: updateError } = await serviceClient
          .from("profiles")
          .update({
            instagram_user_id: instagramUserId,
            instagram_username: instagramUsername,
            instagram_connected_at: new Date().toISOString(),
            instagram_access_token: accessToken,
            instagram_token_expires_at: expiresAt,
            instagram_business_account_id: instagramBusinessAccountId,
            partnership_ads_enabled: true,
            social_handles: { instagram: instagramUsername },
          })
          .eq("id", profile.id);

        if (updateError) {
          logStep("Error updating profile", { error: updateError });
          return new Response(
            JSON.stringify({ error: "Failed to save Instagram connection" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            username: instagramUsername,
            businessAccountId: instagramBusinessAccountId,
            partnershipAdsEnabled: true,
            message: `Successfully connected @${instagramUsername} for Partnership Ads`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        const { error: updateError } = await serviceClient
          .from("profiles")
          .update({
            instagram_user_id: null,
            instagram_username: null,
            instagram_connected_at: null,
            instagram_access_token: null,
            instagram_token_expires_at: null,
            instagram_business_account_id: null,
            partnership_ads_enabled: false,
          })
          .eq("id", profile.id);

        if (updateError) {
          logStep("Error disconnecting Instagram", { error: updateError });
          return new Response(
            JSON.stringify({ error: "Failed to disconnect Instagram" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "Instagram disconnected" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
