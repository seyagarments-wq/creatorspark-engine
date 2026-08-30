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

    const { video_id, new_status, rejection_reason } = await req.json();

    // Get video details
    const { data: video } = await supabase
      .from("videos")
      .select("title, creator_id")
      .eq("id", video_id)
      .single();

    if (!video) {
      throw new Error("Video not found");
    }

    // Get creator name
    const { data: creator } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", video.creator_id)
      .single();

    const creatorName = creator?.full_name || "A creator";

    // Find active mentor assignments for this creator
    const { data: assignments } = await supabase
      .from("mentor_creator_assignments")
      .select("mentor_id")
      .eq("creator_id", video.creator_id)
      .eq("status", "active");

    if (!assignments || assignments.length === 0) {
      console.log("No active mentor assignments for creator:", video.creator_id);
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get mentor user_ids and names
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

    for (const mentor of mentorProfiles) {
      let title: string;
      let message: string;

      if (new_status === "approved") {
        title = `Mentee video approved: ${creatorName}`;
        message = `Hello ${mentor.full_name},\n\nYour mentee ${creatorName}'s video "${video.title}" has been approved.\n\nNo action is required. Continue providing guidance on upcoming submissions.`;
      } else if (new_status === "rejected") {
        const reasonText = rejection_reason
          ? `\n\nRejection reason: ${rejection_reason}`
          : "";
        title = `[Action Required] Mentee video rejected: ${creatorName}`;
        message = `Hello ${mentor.full_name},\n\nYour mentee ${creatorName}'s video "${video.title}" was rejected.${reasonText}\n\nPlease reach out to ${creatorName} via DM to walk them through the rejection reason and what needs to change before resubmission.`;
      } else if (new_status === "revision_requested") {
        const reasonText = rejection_reason
          ? `\n\nRevision notes: ${rejection_reason}`
          : "";
        title = `[Action Required] Mentee video sent back for revision: ${creatorName}`;
        message = `Hello ${mentor.full_name},\n\nYour mentee ${creatorName}'s video "${video.title}" was sent back for revision.${reasonText}\n\nPlease contact ${creatorName} via DM, review the feedback together, and help them implement the changes before they resubmit.`;
      } else {
        continue;
      }

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
          link: "/creator/mentees",
          button_text: "View mentees",
        }),
      });

      notified++;
      console.log(`Mentor ${mentor.full_name} notified about ${creatorName}'s video (${new_status})`);
    }

    return new Response(JSON.stringify({ success: true, notified }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-mentor-video-status:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
