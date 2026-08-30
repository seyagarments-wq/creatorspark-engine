import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CONNECT-ACCOUNT] ${step}${detailsStr}`);
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
    const userEmail = claimsData.claims.email as string;
    logStep("User authenticated via getClaims", { userId, email: userEmail });

    if (!userEmail) {
      throw new Error("User email not available in token");
    }

    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get profile using admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, stripe_account_id, country")
      .eq("user_id", userId)
      .single();

    if (profileError) throw new Error(`Profile fetch error: ${profileError.message}`);
    logStep("Profile fetched", { profileId: profile.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://creatorsctrl.com";

    let accountId = profile.stripe_account_id;

    // Strict country validation — no US fallback
    const ALLOWED_COUNTRIES = ["US", "CA", "GB", "AU", "SG"];
    const rawCountry = (profile.country || "").trim().toUpperCase();

    if (!rawCountry || !ALLOWED_COUNTRIES.includes(rawCountry)) {
      logStep("Country missing or invalid", { rawCountry: profile.country });
      return new Response(JSON.stringify({
        error: "Please select your country on your Profile page and save before connecting your payout account.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const profileCountry = rawCountry;
    logStep("Validated creator country", { profileCountry });

    // If an accountId exists, verify it's accessible AND matches the creator's country
    if (accountId) {
      try {
        const existingAccount = await stripe.accounts.retrieve(accountId);
        logStep("Existing Stripe account retrieved", { accountId, accountCountry: existingAccount.country, profileCountry });

        // Check for country mismatch — if profile country changed, we need a new account
        if (existingAccount.country && existingAccount.country.toUpperCase() !== profileCountry.toUpperCase()) {
          logStep("Country mismatch detected, resetting Stripe account", {
            accountId,
            stripeCountry: existingAccount.country,
            profileCountry,
          });
          await supabaseAdmin
            .from("profiles")
            .update({ stripe_account_id: null, stripe_onboarding_complete: false })
            .eq("id", profile.id);
          accountId = null;
        } else {
          logStep("Existing Stripe account is accessible and country matches", { accountId });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isStripeAccountAccessError(msg)) {
          logStep("Existing Stripe account not accessible with current key; resetting", { accountId });
          await supabaseAdmin
            .from("profiles")
            .update({ stripe_account_id: null, stripe_onboarding_complete: false })
            .eq("id", profile.id);
          accountId = null;
        } else {
          throw e;
        }
      }
    }

    // If no account exists, create one
    if (!accountId) {
      const country = profileCountry;
      logStep("Creating new Stripe Connect account", { country });

      // Non-US countries require the recipient service agreement
      const isNonUS = country !== "US";

      let account;
      try {
        account = await stripe.accounts.create({
          type: "express",
          country,
          email: userEmail,
          ...(isNonUS ? { tos_acceptance: { service_agreement: "recipient" } } : {}),
          metadata: {
            profile_id: profile.id,
            user_id: userId,
          },
          capabilities: {
            transfers: { requested: true },
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logStep("Error creating Stripe account", { message: msg });
        // Surface platform-profile-incomplete error clearly
        if (msg.toLowerCase().includes("complete your platform profile")) {
          return new Response(JSON.stringify({
            error: "Stripe Connect is not fully configured. The platform owner must complete the Connect setup at https://dashboard.stripe.com/connect/accounts/overview before creators can onboard.",
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 503,
          });
        }
        throw e;
      }
      accountId = account.id;
      logStep("Stripe account created", { accountId });

      // Save account ID to profile using admin client
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_account_id: accountId, stripe_onboarding_complete: false })
        .eq("id", profile.id);

      if (updateError) throw new Error(`Failed to save Stripe account: ${updateError.message}`);
    }

    // Create account link for onboarding
    logStep("Creating account link for onboarding");
    let accountLink;
    try {
      accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/creator/profile?stripe_refresh=true`,
        return_url: `${origin}/creator/profile?stripe_success=true`,
        type: "account_onboarding",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isStripeAccountAccessError(msg)) {
        // Extremely defensive fallback: if the stored account changed between checks, reset and ask user to retry.
        logStep("Account link failed due to account access; resetting", { accountId });
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_account_id: null, stripe_onboarding_complete: false })
          .eq("id", profile.id);
        return new Response(JSON.stringify({
          error: "Your payout account link expired or was tied to a different Stripe platform. Please click Connect again.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
      throw e;
    }

    logStep("Account link created", { url: accountLink.url });

    return new Response(JSON.stringify({ url: accountLink.url }), {
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
