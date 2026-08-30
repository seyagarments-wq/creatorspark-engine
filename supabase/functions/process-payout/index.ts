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
  console.log(`[PROCESS-PAYOUT] ${step}${detailsStr}`);
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Authenticate admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Unauthorized: Admin access required");
    logStep("Admin authenticated", { userId: user.id });

    // Get payout ID from request
    const { payout_id } = await req.json();
    if (!payout_id) throw new Error("payout_id is required");
    logStep("Processing payout", { payoutId: payout_id });

    // Get payout with creator info
    const { data: payout, error: payoutError } = await supabaseClient
      .from("payouts")
      .select(`id, amount, status, creator_id, stripe_transfer_id`)
      .eq("id", payout_id)
      .single();

    if (payoutError) throw new Error(`Payout fetch error: ${payoutError.message}`);
    if (!payout) throw new Error("Payout not found");
    logStep("Payout fetched", { payoutId: payout.id, status: payout.status });

    // Get creator profile separately
    const { data: creatorProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, full_name, stripe_account_id, stripe_onboarding_complete")
      .eq("id", payout.creator_id)
      .single();

    if (profileError) throw new Error(`Profile fetch error: ${profileError.message}`);
    if (!creatorProfile) throw new Error("Creator profile not found");

    if (payout.status === "paid") {
      throw new Error("Payout has already been processed");
    }

    if (payout.stripe_transfer_id) {
      throw new Error("Payout already has a Stripe transfer");
    }

    if (!creatorProfile.stripe_account_id) {
      throw new Error("Creator has not connected their Stripe account");
    }

    if (!creatorProfile.stripe_onboarding_complete) {
      throw new Error("Creator has not completed Stripe onboarding");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const amountInCents = Math.round(parseFloat(payout.amount as string) * 100);
    logStep("Creating transfer", { 
      amount: amountInCents, 
      destinationAccount: creatorProfile.stripe_account_id 
    });

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: "usd",
      destination: creatorProfile.stripe_account_id,
      metadata: {
        payout_id: payout.id,
        creator_id: creatorProfile.id,
        creator_name: creatorProfile.full_name,
      },
    });

    logStep("Transfer created", { transferId: transfer.id });

    // Update payout status
    const { error: updateError } = await supabaseClient
      .from("payouts")
      .update({ 
        status: "paid",
        stripe_transfer_id: transfer.id,
        paid_at: new Date().toISOString(),
      })
      .eq("id", payout.id);

    if (updateError) throw new Error(`Failed to update payout: ${updateError.message}`);
    logStep("Payout updated to paid");

    // Send payout notification email to creator
    try {
      // Get creator's user_id from profile
      const { data: creatorUser } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("id", creatorProfile.id)
        .single();

      if (creatorUser?.user_id) {
        await supabaseClient.functions.invoke("send-notification-email", {
          body: {
            user_id: creatorUser.user_id,
            title: "Payout sent",
            message: `Your payout of <strong>$${parseFloat(payout.amount as string).toFixed(2)}</strong> has been sent to your bank account.\n\nThis is the result of your content driving real performance. Stay consistent with uploads to keep your next payout on track.`,
            notification_type: "payout",
            link: "/creator/payouts",
            button_text: "Check Your Payout",
          },
        });
        logStep("Payout notification email sent");

      }
    } catch (emailError) {
      // Don't fail the payout if email fails
      console.error("Failed to send payout email:", emailError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      transfer_id: transfer.id,
      amount: payout.amount,
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
