import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constants
const FACEBOOK_API_VERSION = "v21.0";
const TOKEN_EXPIRY_DAYS = 60;

// Allowed redirect URIs for security validation
const ALLOWED_REDIRECT_URIS = [
  "https://creatorsctrl.com/creator/profile",
  "https://creatorsctrl.com/creator/profile",
  "https://id-preview--c6054663-acc6-4d3a-86fe-f67e45857c29.lovable.app/creator/profile",
];

interface OAuthRequest {
  action: "initiate" | "callback" | "refresh_token" | "check_status" | "disconnect";
  code?: string;
  state?: string;
  redirectUri?: string;
  storedState?: string;
}

interface FacebookError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FACEBOOK-OAUTH] ${step}${detailsStr}`);
};

const logError = (step: string, error: unknown) => {
  const errorDetails = error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error };
  console.error(`[FACEBOOK-OAUTH] ERROR: ${step}`, JSON.stringify(errorDetails));
};

// Generate secure state parameter for CSRF protection
function generateState(profileId: string): string {
  const stateData = {
    profileId,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
  };
  return btoa(JSON.stringify(stateData));
}

// Validate state parameter to prevent CSRF attacks
function validateState(receivedState: string, storedState: string): { valid: boolean; profileId?: string; error?: string } {
  try {
    if (!receivedState || !storedState) {
      return { valid: false, error: "Missing state parameter" };
    }
    
    if (receivedState !== storedState) {
      return { valid: false, error: "State mismatch - possible CSRF attack" };
    }
    
    const stateData = JSON.parse(atob(receivedState));
    
    // Check if state is expired (15 minutes max)
    const maxAge = 15 * 60 * 1000;
    if (Date.now() - stateData.timestamp > maxAge) {
      return { valid: false, error: "State expired - please try again" };
    }
    
    return { valid: true, profileId: stateData.profileId };
  } catch (e) {
    logError("State validation failed", e);
    return { valid: false, error: "Invalid state format" };
  }
}

// Validate redirect URI against allowlist
function validateRedirectUri(uri: string): boolean {
  if (!uri) return false;
  
  // For development, also allow any lovable.app subdomain
  if (uri.includes(".lovable.app/creator/profile")) {
    return true;
  }
  
  return ALLOWED_REDIRECT_URIS.some(allowed => uri.startsWith(allowed.replace("/creator/profile", "")));
}

// Handle Facebook API errors with detailed logging
async function handleFacebookApiCall<T>(
  url: string,
  options?: RequestInit,
  context?: string
): Promise<{ data?: T; error?: string; fbError?: FacebookError["error"] }> {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (data.error) {
      const fbError = data.error as FacebookError["error"];
      logError(`Facebook API Error (${context})`, {
        code: fbError.code,
        subcode: fbError.error_subcode,
        type: fbError.type,
        message: fbError.message,
        fbtrace_id: fbError.fbtrace_id,
      });
      
      // Map Facebook error codes to user-friendly messages
      let userMessage = "An error occurred with Facebook authentication";
      
      switch (fbError.code) {
        case 190:
          userMessage = "Your Facebook session has expired. Please reconnect.";
          break;
        case 4:
          userMessage = "Too many requests. Please wait a moment and try again.";
          break;
        case 100:
          if (fbError.error_subcode === 33) {
            userMessage = "The authorization code has expired. Please try again.";
          } else {
            userMessage = "Invalid request parameters.";
          }
          break;
        case 200:
        case 10:
          userMessage = "Missing required permissions. Please grant all requested permissions.";
          break;
        default:
          userMessage = fbError.message || userMessage;
      }
      
      return { error: userMessage, fbError };
    }
    
    return { data: data as T };
  } catch (e) {
    logError(`Network error (${context})`, e);
    return { error: "Network error communicating with Facebook. Please check your connection." };
  }
}

// Exchange authorization code for access token
async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken?: string; expiresIn?: number; error?: string }> {
  const tokenUrl = new URL(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);
  
  const result = await handleFacebookApiCall<{ access_token: string; token_type: string; expires_in: number }>(
    tokenUrl.toString(),
    undefined,
    "exchangeCodeForToken"
  );
  
  if (result.error) {
    return { error: result.error };
  }
  
  return {
    accessToken: result.data?.access_token,
    expiresIn: result.data?.expires_in,
  };
}

// Exchange short-lived token for long-lived token
async function getLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken?: string; expiresIn?: number; error?: string }> {
  const longTokenUrl = new URL(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token`);
  longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
  longTokenUrl.searchParams.set("client_id", appId);
  longTokenUrl.searchParams.set("client_secret", appSecret);
  longTokenUrl.searchParams.set("fb_exchange_token", shortLivedToken);
  
  const result = await handleFacebookApiCall<{ access_token: string; token_type: string; expires_in: number }>(
    longTokenUrl.toString(),
    undefined,
    "getLongLivedToken"
  );
  
  if (result.error) {
    return { error: result.error };
  }
  
  return {
    accessToken: result.data?.access_token,
    expiresIn: result.data?.expires_in || TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  };
}

// Refresh an existing long-lived token
async function refreshToken(
  existingToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken?: string; expiresIn?: number; error?: string }> {
  // Long-lived tokens can be refreshed when they're close to expiry
  // The refresh uses the same endpoint as long-lived token exchange
  return await getLongLivedToken(existingToken, appId, appSecret);
}

// Get Instagram Business Account from Facebook Pages
async function getInstagramBusinessAccount(
  accessToken: string
): Promise<{ 
  instagramUserId?: string; 
  instagramUsername?: string; 
  instagramBusinessAccountId?: string; 
  error?: string 
}> {
  // Get Facebook Pages
  const pagesResult = await handleFacebookApiCall<{ data: Array<{ id: string; name: string; access_token: string }> }>(
    `https://graph.facebook.com/${FACEBOOK_API_VERSION}/me/accounts?access_token=${accessToken}`,
    undefined,
    "getPages"
  );
  
  if (pagesResult.error) {
    return { error: pagesResult.error };
  }
  
  const pages = pagesResult.data?.data || [];
  
  if (pages.length === 0) {
    return { error: "No Facebook Pages found. Please ensure you have a Facebook Page connected to an Instagram Business account." };
  }
  
  // Find Instagram Business Account connected to any page
  for (const page of pages) {
    const igResult = await handleFacebookApiCall<{ instagram_business_account?: { id: string } }>(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${accessToken}`,
      undefined,
      "getInstagramBusinessAccount"
    );
    
    if (igResult.data?.instagram_business_account?.id) {
      const businessAccountId = igResult.data.instagram_business_account.id;
      
      // Get Instagram username
      const igUserResult = await handleFacebookApiCall<{ id: string; username: string }>(
        `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${businessAccountId}?fields=username,id&access_token=${accessToken}`,
        undefined,
        "getInstagramUser"
      );
      
      if (igUserResult.data) {
        return {
          instagramUserId: igUserResult.data.id,
          instagramUsername: igUserResult.data.username,
          instagramBusinessAccountId: businessAccountId,
        };
      }
    }
  }
  
  return { error: "No Instagram Business Account found. Please connect your Instagram account to a Facebook Page and switch to a Business or Creator account." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started", { method: req.method, url: req.url });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppId = Deno.env.get("META_APP_ID");
    const metaAppSecret = Deno.env.get("META_APP_SECRET");

    // Verify authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logStep("Missing or invalid authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth for JWT validation
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate JWT using getClaims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      logStep("JWT validation failed", { error: claimsError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    logStep("User authenticated", { userId });

    // Use service role client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get the user's profile
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, instagram_user_id, instagram_username, instagram_connected_at, instagram_access_token, instagram_token_expires_at, instagram_business_account_id, partnership_ads_enabled")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      logStep("Profile not found", { error: profileError?.message });
      return new Response(
        JSON.stringify({ error: "Profile not found", message: "User profile does not exist" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Profile fetched", { profileId: profile.id });

    const body: OAuthRequest = await req.json();
    const { action, code, state, redirectUri, storedState } = body;
    logStep("Action requested", { action });

    switch (action) {
      case "check_status": {
        // Check if token needs refresh
        let needsRefresh = false;
        if (profile.instagram_token_expires_at) {
          const expiresAt = new Date(profile.instagram_token_expires_at);
          const refreshThreshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days before expiry
          needsRefresh = expiresAt < refreshThreshold;
        }
        
        return new Response(
          JSON.stringify({
            connected: Boolean(profile.instagram_user_id),
            username: profile.instagram_username,
            connectedAt: profile.instagram_connected_at,
            partnershipAdsEnabled: profile.partnership_ads_enabled,
            tokenExpiresAt: profile.instagram_token_expires_at,
            needsRefresh,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "initiate": {
        if (!metaAppId) {
          return new Response(
            JSON.stringify({ 
              error: "Configuration required",
              message: "Facebook OAuth is not configured. Admin needs to set META_APP_ID in settings." 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!redirectUri) {
          return new Response(
            JSON.stringify({ error: "Missing redirect URI" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate redirect URI against allowlist
        if (!validateRedirectUri(redirectUri)) {
          logStep("Invalid redirect URI", { redirectUri });
          return new Response(
            JSON.stringify({ 
              error: "Invalid redirect URI",
              message: "The redirect URI is not in the allowed list" 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get scopes from environment variable or use development defaults
        // Development (no App Review needed): email,public_profile
        // Production (requires App Review): ads_management,business_management,pages_show_list,pages_read_engagement,instagram_manage_insights
        const defaultDevScopes = "email,public_profile";
        const configuredScopes = Deno.env.get("FACEBOOK_OAUTH_SCOPES") || defaultDevScopes;
        
        logStep("Using OAuth scopes", { scopes: configuredScopes });
        
        const scopes = configuredScopes;

        // Generate secure state for CSRF protection
        const generatedState = generateState(profile.id);

        const authUrl = new URL(`https://www.facebook.com/${FACEBOOK_API_VERSION}/dialog/oauth`);
        authUrl.searchParams.set("client_id", metaAppId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", scopes);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("state", generatedState);

        logStep("Generated auth URL", { redirectUri });

        return new Response(
          JSON.stringify({ 
            authUrl: authUrl.toString(), 
            state: generatedState,
            message: "Redirect to this URL to begin Facebook authentication"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "callback": {
        if (!code) {
          return new Response(
            JSON.stringify({ error: "Missing authorization code" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!redirectUri) {
          return new Response(
            JSON.stringify({ error: "Missing redirect URI" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!metaAppId || !metaAppSecret) {
          return new Response(
            JSON.stringify({ error: "Facebook OAuth credentials not configured" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate CSRF state
        if (state && storedState) {
          const stateValidation = validateState(state, storedState);
          if (!stateValidation.valid) {
            logStep("State validation failed", { error: stateValidation.error });
            return new Response(
              JSON.stringify({ 
                error: "Security validation failed",
                message: stateValidation.error 
              }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        logStep("Exchanging code for access token");

        // Step 1: Exchange code for short-lived token
        const tokenResult = await exchangeCodeForToken(code, redirectUri, metaAppId, metaAppSecret);
        if (tokenResult.error) {
          return new Response(
            JSON.stringify({ error: "Token exchange failed", message: tokenResult.error }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Step 2: Exchange for long-lived token (60 days)
        logStep("Exchanging for long-lived token");
        const longTokenResult = await getLongLivedToken(tokenResult.accessToken!, metaAppId, metaAppSecret);
        
        const accessToken = longTokenResult.accessToken || tokenResult.accessToken!;
        const expiresIn = longTokenResult.expiresIn || TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

        // Step 3: Get Instagram Business Account
        logStep("Fetching Instagram Business Account");
        const igResult = await getInstagramBusinessAccount(accessToken);
        
        if (igResult.error) {
          return new Response(
            JSON.stringify({ 
              error: "Instagram connection failed",
              message: igResult.error 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        logStep(`Found Instagram account: @${igResult.instagramUsername}`, { 
          userId: igResult.instagramUserId,
          businessAccountId: igResult.instagramBusinessAccountId 
        });

        // Step 4: Update profile with connection data
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        const { error: updateError } = await serviceClient
          .from("profiles")
          .update({
            instagram_user_id: igResult.instagramUserId,
            instagram_username: igResult.instagramUsername,
            instagram_connected_at: new Date().toISOString(),
            instagram_access_token: accessToken,
            instagram_token_expires_at: expiresAt,
            instagram_business_account_id: igResult.instagramBusinessAccountId,
            partnership_ads_enabled: true,
            social_handles: { instagram: igResult.instagramUsername },
          })
          .eq("id", profile.id);

        if (updateError) {
          logError("Failed to save Instagram connection", updateError);
          return new Response(
            JSON.stringify({ error: "Database error", message: "Failed to save Instagram connection" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            username: igResult.instagramUsername,
            businessAccountId: igResult.instagramBusinessAccountId,
            partnershipAdsEnabled: true,
            tokenExpiresAt: expiresAt,
            message: `Successfully connected @${igResult.instagramUsername} for Partnership Ads`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "refresh_token": {
        if (!profile.instagram_access_token) {
          return new Response(
            JSON.stringify({ error: "No existing connection", message: "Please connect your Instagram account first" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!metaAppId || !metaAppSecret) {
          return new Response(
            JSON.stringify({ error: "Facebook OAuth credentials not configured" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        logStep("Refreshing access token");
        
        const refreshResult = await refreshToken(profile.instagram_access_token, metaAppId, metaAppSecret);
        
        if (refreshResult.error) {
          // Token refresh failed - user needs to re-authenticate
          return new Response(
            JSON.stringify({ 
              error: "Token refresh failed",
              message: refreshResult.error,
              requiresReauth: true
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const expiresAt = new Date(Date.now() + (refreshResult.expiresIn || TOKEN_EXPIRY_DAYS * 24 * 60 * 60) * 1000).toISOString();

        const { error: updateError } = await serviceClient
          .from("profiles")
          .update({
            instagram_access_token: refreshResult.accessToken,
            instagram_token_expires_at: expiresAt,
          })
          .eq("id", profile.id);

        if (updateError) {
          logError("Failed to update token", updateError);
          return new Response(
            JSON.stringify({ error: "Database error", message: "Failed to save refreshed token" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            tokenExpiresAt: expiresAt,
            message: "Token refreshed successfully",
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
          logError("Failed to disconnect Instagram", updateError);
          return new Response(
            JSON.stringify({ error: "Database error", message: "Failed to disconnect Instagram" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        logStep("Instagram disconnected", { profileId: profile.id });

        return new Response(
          JSON.stringify({ success: true, message: "Instagram disconnected successfully" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action", message: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    logError("Unhandled exception", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
