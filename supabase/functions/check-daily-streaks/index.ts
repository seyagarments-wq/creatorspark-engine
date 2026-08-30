import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[CHECK-DAILY-STREAKS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Fetch all gamification records
    const { data: gamRecords, error: gamError } = await supabase
      .from("creator_gamification")
      .select("id, creator_id, current_streak, longest_streak, last_activity_date");

    if (gamError) throw new Error(`Failed to fetch gamification: ${gamError.message}`);
    logStep("Fetched gamification records", { count: gamRecords?.length || 0 });

    if (!gamRecords?.length) {
      return new Response(JSON.stringify({ success: true, message: "No gamification records" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creatorIds = gamRecords.map((g) => g.creator_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id, full_name")
      .in("id", creatorIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    let streaksReset = 0;
    let remindersSent = 0;

    for (const record of gamRecords) {
      const lastActivity = record.last_activity_date;
      const profile = profileMap.get(record.creator_id);
      if (!profile) continue;

      // Case 1: Streak broken (last activity before yesterday)
      if (lastActivity && lastActivity !== todayStr && lastActivity !== yesterdayStr && record.current_streak > 0) {
        await supabase
          .from("creator_gamification")
          .update({ current_streak: 0 })
          .eq("id", record.id);
        streaksReset++;
      }

      // Case 2: At risk — posted yesterday but not today
      if (lastActivity === yesterdayStr && record.current_streak > 0) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({
              user_id: profile.user_id,
              title: "Don't break it now. 🔴",
              message: `You've been on a ${record.current_streak}-day streak. That's not nothing — that's discipline, that's momentum, that's proof you're serious about this.\n\nBut today? Nothing yet.\n\nYou've got a few hours. Don't let one lazy day erase what you've built.`,
              notification_type: "general",
              link: "/creator/submit",
              button_text: "Keep Your Streak Alive",
            }),
          });
          remindersSent++;
        } catch (err) {
          logStep("Failed to send streak reminder", { userId: profile.user_id, error: String(err) });
        }
      }
    }

    logStep("Complete", { streaksReset, remindersSent });

    return new Response(
      JSON.stringify({ success: true, streaksReset, remindersSent, totalCreators: gamRecords.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
