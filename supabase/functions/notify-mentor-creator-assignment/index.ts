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

    const { mentor_id, creator_id } = await req.json();

    // Get mentor profile
    const { data: mentor } = await supabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("id", mentor_id)
      .single();

    // Get creator profile
    const { data: creator } = await supabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("id", creator_id)
      .single();

    if (!mentor || !creator) {
      throw new Error("Could not find mentor or creator profile");
    }

    // Notify the creator about their new mentor
    const creatorMessage = `Hello ${creator.full_name},\n\nYou have been assigned a mentor: ${mentor.full_name}.\n\nYour mentor will review your content and reach out via DM with feedback and recommendations to help you improve. Please respond promptly to their messages and apply the feedback to upcoming videos.\n\nYou can find your mentor and message history in the chat section of the app.`;

    await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_id: creator.user_id,
        title: "You have been assigned a mentor",
        message: creatorMessage,
        notification_type: "general",
        link: "/creator",
        button_text: "Open dashboard",
      }),
    });

    console.log("Creator assignment notification sent to:", creator.full_name);

    // Notify the mentor about their new mentee
    const mentorMessage = `Hello ${mentor.full_name},\n\nYou have been assigned a new mentee: ${creator.full_name}.\n\nPlease open the Mentees tab to view their profile and videos. Your responsibilities are:\n\n1. Introduce yourself to ${creator.full_name} via DM.\n2. Review their videos and provide constructive feedback.\n3. Share examples of effective content with a brief explanation of what makes them work.`;

    await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_id: mentor.user_id,
        title: "[Action Required] New mentee assigned",
        message: mentorMessage,
        notification_type: "general",
        link: "/creator/mentees",
        button_text: "View mentees",
      }),
    });

    console.log("Mentor notification sent to:", mentor.full_name);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-mentor-creator-assignment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
