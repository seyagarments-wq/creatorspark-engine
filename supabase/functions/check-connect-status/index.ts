import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-CONNECT-STATUS] ${step}${detailsStr}`);
};

const isStripeAccountAccessError = (message: string) => {
  const m = message.toLowerCase();
  return (
    m.includes("does not have access to account") ||
    m.includes("not connected to your platform") ||
    m.includes("does not exist") ||
    m.includes("application access may have been revoked")
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Verify authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logStep("Missing or invalid authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth for JWT validation
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate JWT using getClaims instead of getUser
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      logStep("JWT validation failed", { error: claimsError?.message });
      return new Response(
        JSON.stringify({ error: "Authentication error: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    logStep("User authenticated via getClaims", { userId });

    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get profile using admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", userId)
      .single();

    if (profileError) throw new Error(`Profile fetch error: ${profileError.message}`);
    logStep("Profile fetched", { profileId: profile.id, stripeAccountId: profile.stripe_account_id });

    if (!profile.stripe_account_id) {
      return new Response(JSON.stringify({ 
        connected: false, 
        onboarding_complete: false,
        payouts_enabled: false 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check account status
    let account;
    try {
      account = await stripe.accounts.retrieve(profile.stripe_account_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isStripeAccountAccessError(msg)) {
        logStep("Stored Stripe account not accessible; resetting", { accountId: profile.stripe_account_id });
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_account_id: null, stripe_onboarding_complete: false })
          .eq("id", profile.id);

        return new Response(JSON.stringify({
          connected: false,
          onboarding_complete: false,
          payouts_enabled: false,
          message: "Previous payout account is no longer valid for the current Stripe platform. Please reconnect.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      throw e;
    }
    logStep("Stripe account retrieved", { 
      accountId: account.id, 
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted
    });

    const isComplete = account.details_submitted && account.payouts_enabled;

    // Update onboarding status in database if changed
    if (isComplete !== profile.stripe_onboarding_complete) {
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_onboarding_complete: isComplete })
        .eq("id", profile.id);
      logStep("Updated onboarding status", { isComplete });
    }

    return new Response(JSON.stringify({
      connected: true,
      onboarding_complete: account.details_submitted,
      payouts_enabled: account.payouts_enabled,
      account_id: account.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
