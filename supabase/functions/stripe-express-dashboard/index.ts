import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getSecret } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-EXPRESS-DASHBOARD] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = (await getSecret("STRIPE_SECRET_KEY"));
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

    // Validate JWT
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
    logStep("User authenticated", { userId });

    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", userId)
      .single();

    if (profileError) throw new Error(`Profile fetch error: ${profileError.message}`);
    logStep("Profile fetched", { profileId: profile.id, stripeAccountId: profile.stripe_account_id });

    if (!profile.stripe_account_id) {
      return new Response(
        JSON.stringify({ error: "No Stripe account connected. Please complete payout setup first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // First check if the account has completed onboarding
    const account = await stripe.accounts.retrieve(profile.stripe_account_id);
    logStep("Account retrieved", { 
      detailsSubmitted: account.details_submitted, 
      payoutsEnabled: account.payouts_enabled 
    });

    // If onboarding is not complete, create an account link to continue onboarding
    if (!account.details_submitted || !account.payouts_enabled) {
      logStep("Onboarding incomplete, creating account link");
      
      const origin = req.headers.get("origin") || "https://creatorsctrl.com";
      const accountLink = await stripe.accountLinks.create({
        account: profile.stripe_account_id,
        refresh_url: `${origin}/creator/profile`,
        return_url: `${origin}/creator/payouts`,
        type: "account_onboarding",
      });
      
      logStep("Account link created for onboarding", { url: accountLink.url });
      
      return new Response(JSON.stringify({ 
        url: accountLink.url,
        onboarding_required: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Create a login link to the Express dashboard
    const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id);
    logStep("Login link created", { url: loginLink.url });

    return new Response(JSON.stringify({ url: loginLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    
    // Handle specific Stripe errors
    if (errorMessage.includes("does not have access") || errorMessage.includes("not connected")) {
      return new Response(
        JSON.stringify({ error: "Your Stripe account needs to be reconnected. Please complete payout setup." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
