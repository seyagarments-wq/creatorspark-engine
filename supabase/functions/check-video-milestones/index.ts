import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IMPRESSION_MILESTONES = [10000, 50000, 100000, 500000, 1000000];
const SALE_MILESTONES = [1, 10, 50, 100, 500];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all approved videos with performance data
    const { data: videos, error: videosError } = await supabase
      .from("videos")
      .select("id, title, creator_id, profiles:creator_id(user_id, full_name)")
      .eq("status", "approved");

    if (videosError) throw videosError;
    if (!videos || videos.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get aggregated performance per video
    const videoIds = videos.map((v) => v.id);
    const { data: perfData } = await supabase
      .from("performance_data")
      .select("video_id, impressions, purchases")
      .in("video_id", videoIds);

    // Aggregate by video
    const totals = new Map<string, { impressions: number; purchases: number }>();
    for (const row of perfData || []) {
      const existing = totals.get(row.video_id) || { impressions: 0, purchases: 0 };
      totals.set(row.video_id, {
        impressions: existing.impressions + (row.impressions || 0),
        purchases: existing.purchases + (row.purchases || 0),
      });
    }

    // Load already-notified milestones from settings (stored as JSON)
    const { data: settingRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "video_milestone_notifications")
      .maybeSingle();

    const notified: Record<string, string[]> = (settingRow?.value as any) || {};
    let notificationsSent = 0;
    const updatedNotified = { ...notified };

    for (const video of videos) {
      const perf = totals.get(video.id) || { impressions: 0, purchases: 0 };
      const creator = video.profiles as any;
      if (!creator?.user_id) continue;

      const videoNotified = updatedNotified[video.id] || [];

      // Check impression milestones
      for (const milestone of IMPRESSION_MILESTONES) {
        const key = `imp_${milestone}`;
        if (perf.impressions >= milestone && !videoNotified.includes(key)) {
          const label = milestone >= 1000000
            ? `${milestone / 1000000}M`
            : `${milestone / 1000}K`;

          await supabase.functions.invoke("send-notification-email", {
            body: {
              user_id: creator.user_id,
              title: `Your video just hit ${label} views. Wow. 👀`,
              message: `One of your videos just crossed a milestone — <strong>${label} impressions</strong>. That's not small. That's real reach.\n\n"${video.title}" is doing the work. People are watching.`,
              notification_type: "video",
              link: "/creator/my-videos",
              button_text: "See How It's Performing",
            },
          });

          videoNotified.push(key);
          notificationsSent++;
        }
      }

      // Check sale milestones (first sale is special)
      for (const milestone of SALE_MILESTONES) {
        const key = `sale_${milestone}`;
        if (perf.purchases >= milestone && !videoNotified.includes(key)) {
          const label = milestone === 1 ? "first sale" : `${milestone} sales`;
          await supabase.functions.invoke("send-notification-email", {
            body: {
              user_id: creator.user_id,
              title: milestone === 1 ? "Your first sale just landed! 💸" : `${milestone} sales and counting! 🛒`,
              message: `"${video.title}" just hit <strong>${label}</strong>! Your video is converting.\n\nThis is what consistent posting gets you. Keep going.`,
              notification_type: "video",
              link: "/creator/my-videos",
              button_text: "See How It's Performing",
            },
          });

          videoNotified.push(key);
          notificationsSent++;
        }
      }

      updatedNotified[video.id] = videoNotified;
    }

    // Persist the updated notified state
    await supabase
      .from("settings")
      .upsert({ key: "video_milestone_notifications", value: updatedNotified as any }, { onConflict: "key" });

    return new Response(
      JSON.stringify({ success: true, notified: notificationsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
