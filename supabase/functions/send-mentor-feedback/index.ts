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

    const { mentor_id, video_id, creator_id, feedback } = await req.json();

    // Get mentor name
    const { data: mentor } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", mentor_id)
      .single();

    // Get creator profile (for email + user_id for notification)
    const { data: creator } = await supabase
      .from("profiles")
      .select("full_name, email, user_id")
      .eq("id", creator_id)
      .single();

    // Get video title
    const { data: video } = await supabase
      .from("videos")
      .select("title")
      .eq("id", video_id)
      .single();

    if (!mentor || !creator || !video) {
      throw new Error("Could not find mentor, creator, or video data");
    }

    const mentorName = mentor.full_name;
    const videoTitle = video.title;

    // Mark feedback as emailed
    await supabase
      .from("mentor_feedback")
      .update({ emailed: true })
      .eq("mentor_id", mentor_id)
      .eq("video_id", video_id);

    // Also update the mentor_assignment task_feedback_sent flag
    await supabase
      .from("mentor_assignments")
      .update({ task_feedback_sent: true, status: "in_progress", updated_at: new Date().toISOString() })
      .eq("mentor_id", mentor_id)
      .eq("video_id", video_id);

    // Send email + in-app notification via send-notification-email
    const message = `Your teammate ${mentorName} watched your video "${videoTitle}" and left you some feedback.\n\n"${feedback}"\n\nThey've been where you are. Take a look at what they said and use it on your next upload.\n\nYou can reply to them directly in chat if you want to talk it through.`;

    const notifyResponse = await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_id: creator.user_id,
        title: "Your teammate has some tips for you.",
        message,
        notification_type: "general",
        link: "/creator/videos",
        button_text: "View My Videos",
      }),
    });

    const notifyResult = await notifyResponse.json();
    console.log("Notification result:", notifyResult);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-mentor-feedback:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
