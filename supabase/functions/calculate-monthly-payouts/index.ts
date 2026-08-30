import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GUARANTEED_AMOUNT = 500;
const VIDEOS_FOR_GUARANTEE = 35;

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CALCULATE-MONTHLY-PAYOUTS] ${step}${detailsStr}`);
};

interface GuaranteeResult {
  creatorId: string;
  creatorName: string;
  approvedVideosCount: number;
  eligibleForGuarantee: boolean;
  guaranteeAmount: number;
  status: "pending_approval" | "skipped" | "already_exists";
  reason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started - Monthly Guarantee Calculation");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Authenticate admin user (optional - cron jobs won't have auth header)
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !authHeader.includes(supabaseServiceKey)) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      
      if (userError || !userData.user) {
        throw new Error("Authentication failed");
      }

      // Check if user is admin
      const { data: roleData } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) throw new Error("Unauthorized: Admin access required");
      logStep("Admin authenticated", { userId: userData.user.id });
    } else {
      logStep("Running as system/cron job");
    }

    // Get optional month parameter (defaults to previous month for 1st of month runs)
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const targetMonth = body.month 
      ? new Date(body.month) 
      : new Date(now.getFullYear(), now.getMonth() - 1, 1); // Previous month
    
    // Calculate month boundaries
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const monthLabel = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });
    logStep("Calculating guarantees for month", { 
      monthLabel, 
      start: monthStart.toISOString(), 
      end: monthEnd.toISOString() 
    });

    // Get all creators
    const { data: creators, error: creatorsError } = await supabaseClient
      .from("profiles")
      .select("id, full_name, user_id, stripe_account_id, stripe_onboarding_complete")
      .order("full_name");

    if (creatorsError) throw new Error(`Failed to fetch creators: ${creatorsError.message}`);
    logStep("Fetched creators", { count: creators?.length || 0 });

    // Filter to only creators (not admins)
    const creatorProfiles = [];
    for (const profile of creators || []) {
      const { data: roleCheck } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.user_id)
        .eq("role", "creator")
        .single();
      
      if (roleCheck) {
        creatorProfiles.push(profile);
      }
    }
    logStep("Filtered to creators only", { count: creatorProfiles.length });

    const results: GuaranteeResult[] = [];
    let pendingApprovals = 0;

    for (const creator of creatorProfiles) {
      try {
        // Get approved videos this month
        // Only count "regular" uploads (not tagged to a bounty) toward the guarantee
        const { data: approvedVideos, error: videosError } = await supabaseClient
          .from("videos")
          .select("id")
          .eq("creator_id", creator.id)
          .eq("status", "approved")
          .is("bounty_id", null)
          .gte("created_at", monthStart.toISOString())
          .lte("created_at", monthEnd.toISOString());

        if (videosError) {
          logStep("Videos query error", { creator: creator.full_name, error: videosError.message });
          continue;
        }

        const approvedCount = approvedVideos?.length || 0;
        const eligibleForGuarantee = approvedCount >= VIDEOS_FOR_GUARANTEE;

        // Phase 4: gate on cohort eligibility — ineligible creators forfeit (no rollover)
        const monthKey = monthStart.toISOString().slice(0, 10);
        const { data: elig } = await supabaseClient
          .from("creator_monthly_eligibility")
          .select("status, missed_days")
          .eq("creator_id", creator.id)
          .eq("month", monthKey)
          .maybeSingle();

        if (elig && elig.status === "ineligible") {
          results.push({
            creatorId: creator.id,
            creatorName: creator.full_name,
            approvedVideosCount: approvedCount,
            eligibleForGuarantee: false,
            guaranteeAmount: 0,
            status: "skipped",
            reason: `Forfeited: ${elig.missed_days} missed days exceeded cohort threshold`,
          });
          continue;
        }

        if (!eligibleForGuarantee) {
          results.push({
            creatorId: creator.id,
            creatorName: creator.full_name,
            approvedVideosCount: approvedCount,
            eligibleForGuarantee: false,
            guaranteeAmount: 0,
            status: "skipped",
            reason: `Only ${approvedCount}/${VIDEOS_FOR_GUARANTEE} videos approved`,
          });
          continue;
        }

        // Check if guarantee payout already exists for this month (match by notes containing month label)
        const { data: existingPayouts } = await supabaseClient
          .from("payouts")
          .select("id, status")
          .eq("creator_id", creator.id)
          .eq("payout_type", "guarantee")
          .ilike("notes", `%${monthLabel}%`);

        const existingPayout = existingPayouts && existingPayouts.length > 0 ? existingPayouts[0] : null;

        if (existingPayout) {
          results.push({
            creatorId: creator.id,
            creatorName: creator.full_name,
            approvedVideosCount: approvedCount,
            eligibleForGuarantee: true,
            guaranteeAmount: GUARANTEED_AMOUNT,
            status: "already_exists",
            reason: `Guarantee already exists with status: ${existingPayout.status}`,
          });
          continue;
        }

        // Create PENDING payout - requires admin approval
        const { error: insertError } = await supabaseClient
          .from("payouts")
          .insert({
            creator_id: creator.id,
            amount: GUARANTEED_AMOUNT,
            payout_type: "guarantee",
            status: "pending", // Requires admin approval
            notes: `${monthLabel} guarantee: ${approvedCount} approved videos. Awaiting admin approval.`,
          });

        if (insertError) {
          logStep("Failed to create guarantee payout", { 
            creator: creator.full_name, 
            error: insertError.message 
          });
          continue;
        }

        results.push({
          creatorId: creator.id,
          creatorName: creator.full_name,
          approvedVideosCount: approvedCount,
          eligibleForGuarantee: true,
          guaranteeAmount: GUARANTEED_AMOUNT,
          status: "pending_approval",
        });

        pendingApprovals++;

        // Phase 5: month_eligible event — uses send-notification-email so it
        // lands in the bell, push, AND email (respecting prefs)
        if (creator.user_id) {
          await supabaseClient.functions.invoke("send-notification-email", {
            body: {
              user_id: creator.user_id,
              title: "🎉 You qualified for this month's payout",
              message: `Locked in. Estimated commission: $${GUARANTEED_AMOUNT.toFixed(2)} (${approvedCount} approved videos). Payout processing starts shortly.`,
              notification_type: "payout",
              link: "/creator/payouts",
            },
          }).catch((e) => logStep("month_eligible notify failed", { error: e?.message }));
        }

      } catch (creatorError: any) {
        logStep("Creator processing error", { 
          creator: creator.full_name, 
          error: creatorError.message 
        });
      }
    }

    logStep("Calculation complete", { 
      totalCreators: results.length,
      pendingApprovals,
      eligible: results.filter(r => r.eligibleForGuarantee).length,
      skipped: results.filter(r => r.status === "skipped").length,
    });

    return new Response(JSON.stringify({
      success: true,
      month: monthLabel,
      summary: {
        creatorsProcessed: results.length,
        pendingApprovals,
        eligible: results.filter(r => r.eligibleForGuarantee).length,
        skipped: results.filter(r => r.status === "skipped").length,
        alreadyExists: results.filter(r => r.status === "already_exists").length,
      },
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
