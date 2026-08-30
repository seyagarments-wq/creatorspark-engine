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
  console.log(`[PROCESS-BULK-PAYOUTS] ${step}${detailsStr}`);
};

interface PayoutResult {
  payout_id: string;
  creator_name: string;
  amount: number;
  payout_type: string;
  success: boolean;
  error?: string;
  transfer_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started - Process Approved Payouts");

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

    // Get optional filters from request body
    const body = await req.json().catch(() => ({}));
    const payoutTypeFilter = body.payout_type;
    const includeCommissions = body.include_commissions === true;

    // Fetch ALL pending payouts (include commissions if requested)
    let query = supabaseClient
      .from("payouts")
      .select("id, amount, creator_id, status, payout_type")
      .in("status", ["approved", "pending"])
      .is("stripe_transfer_id", null);

    if (!includeCommissions) {
      query = query.neq("payout_type", "commission");
    }

    if (payoutTypeFilter) {
      query = query.eq("payout_type", payoutTypeFilter);
    }

    const { data: payoutsToProcess, error: payoutsError } = await query;

    if (payoutsError) throw new Error(`Failed to fetch payouts: ${payoutsError.message}`);
    
    if (!payoutsToProcess || payoutsToProcess.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No pending payouts to process",
        processed: 0,
        successful: 0,
        failed: 0,
        results: []
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found payouts to process", { count: payoutsToProcess.length });

    // Get all unique creator IDs
    const creatorIds = [...new Set(payoutsToProcess.map(p => p.creator_id))];

    // Fetch creator profiles with Stripe info
    const { data: creators, error: creatorsError } = await supabaseClient
      .from("profiles")
      .select("id, full_name, user_id, stripe_account_id, stripe_onboarding_complete, payout_method, paypal_email")
      .in("id", creatorIds);

    if (creatorsError) throw new Error(`Failed to fetch creators: ${creatorsError.message}`);

    // Create a map for quick lookup
    const creatorMap = new Map(creators?.map(c => [c.id, c]) || []);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: PayoutResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process each payout
    for (const payout of payoutsToProcess) {
      const creator = creatorMap.get(payout.creator_id);
      const result: PayoutResult = {
        payout_id: payout.id,
        creator_name: creator?.full_name || "Unknown",
        amount: parseFloat(payout.amount as string),
        payout_type: payout.payout_type,
        success: false,
      };

      try {
        if (!creator) {
          throw new Error("Creator profile not found");
        }

        const creatorPayoutMethod = (creator as any).payout_method || "stripe";
        const creatorPaypalEmail = (creator as any).paypal_email;

        if (creatorPayoutMethod === "paypal") {
          // Skip PayPal creators in bulk Stripe processing — they need individual PayPal payouts
          result.error = "PayPal creator — use individual PayPal payout";
          result.success = false;
          failed++;
          results.push(result);
          continue;
        }

        if (!creator.stripe_account_id) {
          throw new Error("Creator has not connected Stripe account");
        }

        if (!creator.stripe_onboarding_complete) {
          throw new Error("Creator has not completed Stripe onboarding");
        }

        const amountInCents = Math.round(result.amount * 100);
        logStep("Creating transfer", { 
          payoutId: payout.id,
          type: payout.payout_type,
          amount: amountInCents, 
          destination: creator.stripe_account_id 
        });

        // Create transfer to connected account
        const transfer = await stripe.transfers.create({
          amount: amountInCents,
          currency: "usd",
          destination: creator.stripe_account_id,
          metadata: {
            payout_id: payout.id,
            payout_type: payout.payout_type,
            creator_id: creator.id,
            creator_name: creator.full_name,
          },
        });

        // Update payout status to paid
        const { error: updateError } = await supabaseClient
          .from("payouts")
          .update({ 
            status: "paid",
            stripe_transfer_id: transfer.id,
            paid_at: new Date().toISOString(),
          })
          .eq("id", payout.id);

        if (updateError) {
          throw new Error(`Failed to update payout record: ${updateError.message}`);
        }

        result.success = true;
        result.transfer_id = transfer.id;
        successful++;
        logStep("Transfer successful", { payoutId: payout.id, transferId: transfer.id });

        // Send notification + email to creator
        if (creator.user_id) {
          const typeLabel = payout.payout_type === "guarantee" 
            ? "Monthly Guarantee" 
            : payout.payout_type === "bounty" 
              ? "Bounty Reward" 
              : payout.payout_type === "challenge" 
                ? "Challenge Reward" 
                : payout.payout_type === "commission"
                  ? "Commission"
                  : "Payout";

          await supabaseClient.from("notifications").insert({
            user_id: creator.user_id,
            title: "Payout sent",
            message: `Your ${typeLabel.toLowerCase()} of $${result.amount.toFixed(2)} has been sent to your bank account.`,
            notification_type: "payout",
            link: "/creator/payouts",
          });

          // Send Love Island themed email notification
          try {
            await supabaseClient.functions.invoke("send-notification-email", {
              body: {
                user_id: creator.user_id,
                title: "Payout sent",
                message: `Your ${typeLabel.toLowerCase()} payout of <strong>$${result.amount.toFixed(2)}</strong> has been sent to your bank account.\n\nThis is the result of your content driving real performance. Stay consistent with uploads to keep your next payout on track.`,
                notification_type: "payout",
                link: "/creator/payouts",
                button_text: "Check Your Payout",
              },
            });
          } catch (emailErr) {
            logStep("Email notification failed", { creator: creator.full_name, error: String(emailErr) });
          }
        }


      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        failed++;
        logStep("Transfer failed", { payoutId: payout.id, error: result.error });
      }

      results.push(result);
    }

    const totalAmount = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.amount, 0);

    logStep("Bulk processing complete", { successful, failed, totalAmount });

    return new Response(JSON.stringify({ 
      message: `Processed ${payoutsToProcess.length} payouts`,
      processed: payoutsToProcess.length,
      successful,
      failed,
      total_amount: totalAmount,
      results,
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
