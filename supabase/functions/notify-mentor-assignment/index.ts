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

    const { mentor_id, video_id } = await req.json();

    // Get mentor profile
    const { data: mentor } = await supabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("id", mentor_id)
      .single();

    // Get video details
    const { data: video } = await supabase
      .from("videos")
      .select("title, creator_id, rejection_reason")
      .eq("id", video_id)
      .single();

    if (!mentor || !video) {
      throw new Error("Could not find mentor or video data");
    }

    // Get creator name
    const { data: creator } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", video.creator_id)
      .single();

    const creatorName = creator?.full_name || "a creator";
    const rejectionReason = video.rejection_reason || "Not specified";

    const message = `Hello ${mentor.full_name},\n\nYou have been assigned a video to review as a mentor.\n\nVideo: "${video.title}" by ${creatorName}\nRejection reason: ${rejectionReason}\n\nPlease open the "Content Review" tab in the app to find this assignment. Your responsibilities are:\n\n1. Contact the creator via DM to discuss the video.\n2. Provide constructive feedback on what needs to change.\n3. Share an example of a similar video that performs well, with a brief explanation of why.\n\nOnce all three are complete, mark the assignment as complete and add your notes so the admin team has a record of the conversation.`;

    // Send email + in-app notification
    await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_id: mentor.user_id,
        title: "[Action Required] New mentor assignment: video to review",
        message,
        notification_type: "general",
        link: "/creator/content-review",
        button_text: "View assignment",
      }),
    });

    console.log("Mentor assignment notification sent to:", mentor.full_name);

    // Notify the creator that a mentor will reach out
    const creatorMessage = `Hello ${creatorName},\n\nYour video "${video.title}" was reviewed and needs revisions before it can be approved.\n\nYou have been paired with ${mentor.full_name}, an experienced creator on the platform, who will reach out to you via DM with specific feedback and guidance on what to change.\n\nPlease watch for their message and respond promptly so you can resubmit the video.`;

    // Get creator's user_id
    const { data: creatorProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", video.creator_id)
      .single();

    if (creatorProfile) {
      await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_id: creatorProfile.user_id,
          title: "[Important] A mentor will be reaching out about your video",
          message: creatorMessage,
          notification_type: "video",
          link: "/creator/videos",
          button_text: "View my videos",
        }),
      });
      console.log("Creator rejection support notification sent to:", creatorName);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-mentor-assignment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
