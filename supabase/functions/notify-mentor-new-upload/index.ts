import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { creator_id, video_titles } = await req.json();

    if (!creator_id) {
      throw new Error("creator_id is required");
    }

    // Get creator name
    const { data: creator } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", creator_id)
      .single();

    const creatorName = creator?.full_name || "Your mentee";

    // Find active mentor assignments for this creator
    const { data: assignments } = await supabase
      .from("mentor_creator_assignments")
      .select("mentor_id")
      .eq("creator_id", creator_id)
      .eq("status", "active");

    if (!assignments || assignments.length === 0) {
      console.log("No active mentor assignments for creator:", creator_id);
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get mentor profiles
    const mentorIds = assignments.map(a => a.mentor_id);
    const { data: mentorProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, user_id")
      .in("id", mentorIds);

    if (!mentorProfiles || mentorProfiles.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let notified = 0;
    const videoList = Array.isArray(video_titles) && video_titles.length > 0
      ? video_titles.map((t: string) => `"${t}"`).join(", ")
      : "a new video";

    for (const mentor of mentorProfiles) {
      const title = `[Action Required] New mentee upload to pre-screen`;
      const message = `Hello ${mentor.full_name},\n\n${creatorName} has submitted ${videoList}.\n\nPlease open Content Review to pre-screen the video before it reaches the admin queue. If the content looks ready for approval, mark it "Likely Approve." If revisions are needed, flag it with notes so the creator can fix the issues before admin review.`;

      await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_id: mentor.user_id,
          title,
          message,
          notification_type: "video",
          link: "/creator/content-review",
          button_text: "Review now",
        }),
      });

      notified++;
      console.log(`Mentor ${mentor.full_name} notified about ${creatorName}'s upload`);
    }

    return new Response(JSON.stringify({ success: true, notified }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-mentor-new-upload:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
