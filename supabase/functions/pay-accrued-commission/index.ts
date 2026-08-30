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
  console.log(`[PAY-ACCRUED-COMMISSION] ${step}${detailsStr}`);
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

    // Get creator_id from request
    const { creator_id } = await req.json();
    if (!creator_id) throw new Error("creator_id is required");
    logStep("Processing accrued commission for creator", { creatorId: creator_id });

    // Get creator profile with Stripe info
    const { data: creator, error: creatorError } = await supabaseClient
      .from("profiles")
      .select("id, full_name, user_id, commission_percentage, stripe_account_id, stripe_onboarding_complete")
      .eq("id", creator_id)
      .single();

    if (creatorError) throw new Error(`Creator fetch error: ${creatorError.message}`);
    if (!creator) throw new Error("Creator not found");

    if (!creator.stripe_account_id) {
      throw new Error("Creator has not connected their Stripe account");
    }

    if (!creator.stripe_onboarding_complete) {
      throw new Error("Creator has not completed Stripe onboarding");
    }

    logStep("Creator verified", { 
      name: creator.full_name, 
      stripeAccount: creator.stripe_account_id 
    });

    // Get all approved videos for this creator
    const { data: videos } = await supabaseClient
      .from("videos")
      .select("id")
      .eq("creator_id", creator_id)
      .eq("status", "approved");

    if (!videos || videos.length === 0) {
      throw new Error("Creator has no approved videos");
    }

    const videoIds = videos.map(v => v.id);

    // Get the effective date of the last paid commission payout for this creator
    const { data: lastPayout } = await supabaseClient
      .from("payouts")
      .select("paid_at, created_at")
      .eq("creator_id", creator_id)
      .eq("payout_type", "commission")
      .eq("status", "paid")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const effectivePaidAt = lastPayout?.paid_at ?? lastPayout?.created_at;
    const lastPayoutDate = effectivePaidAt
      ? new Date(effectivePaidAt).toISOString().split("T")[0]
      : null;

    logStep("Last payout date", { lastPayoutDate });

    // Get ALL unpaid performance data (cumulative since last payout)
    let perfQuery = supabaseClient
      .from("performance_data")
      .select("revenue, commission_rate_at_time")
      .in("video_id", videoIds);

    if (lastPayoutDate) {
      perfQuery = perfQuery.gt("metric_date", lastPayoutDate);
    }

    const { data: perfData } = await perfQuery;

    // Calculate commission using stored daily rates
    const defaultRate = creator.commission_percentage || 10;
    let totalRevenue = 0;
    let totalCommission = 0;

    (perfData || []).forEach((row) => {
      const rev = parseFloat((row.revenue as any) || "0");
      const rate = row.commission_rate_at_time ?? defaultRate;
      totalRevenue += rev;
      totalCommission += rev * (rate / 100);
    });

    const roundedCommission = Math.round(totalCommission * 100) / 100;

    if (roundedCommission <= 0) {
      throw new Error("No accrued commission to pay");
    }

    logStep("Calculated commission", { 
      totalRevenue, 
      totalCommission: roundedCommission 
    });

    // Create Stripe transfer
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const amountInCents = Math.round(roundedCommission * 100);

    logStep("Creating Stripe transfer", { 
      amount: amountInCents, 
      destination: creator.stripe_account_id 
    });

    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: "usd",
      destination: creator.stripe_account_id,
      metadata: {
        payout_type: "commission",
        creator_id: creator.id,
        creator_name: creator.full_name,
        triggered_by: "admin_manual",
      },
    });

    logStep("Transfer created", { transferId: transfer.id });

    // Insert payout record
    const { error: insertError } = await supabaseClient.from("payouts").insert({
      creator_id: creator.id,
      amount: roundedCommission,
      payout_type: "commission",
      status: "paid",
      stripe_transfer_id: transfer.id,
      paid_at: new Date().toISOString(),
      notes: "Manual commission payout by admin",
    });

    if (insertError) {
      logStep("WARNING: Failed to insert payout record", { error: insertError.message });
    }

    // Send notification to creator
    if (creator.user_id) {
      await supabaseClient.from("notifications").insert({
        user_id: creator.user_id,
        title: "Commission payout sent",
        message: `Your commission of $${roundedCommission.toFixed(2)} has been sent to your bank account.`,
        notification_type: "payout",
        link: "/creator/payouts",
      });

      try {
        await supabaseClient.functions.invoke("send-notification-email", {
          body: {
            user_id: creator.user_id,
            title: "Commission payout sent",
            message: `Your commission payout of <strong>$${roundedCommission.toFixed(2)}</strong> has been sent to your bank account.\n\nThis is the result of your content driving real performance. Stay consistent with uploads to keep your next payout on track.`,
            notification_type: "payout",
            link: "/creator/payouts",
            button_text: "Check Your Payout",
          },
        });
      } catch (emailError) {
        logStep("Email notification failed", { error: String(emailError) });
      }
    }

    logStep("Payout complete");

    return new Response(JSON.stringify({ 
      success: true, 
      transfer_id: transfer.id,
      amount: roundedCommission,
      creator_name: creator.full_name,
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
