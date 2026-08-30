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

    const { mentor_profile_id } = await req.json();

    const { data: mentor } = await supabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("id", mentor_profile_id)
      .single();

    if (!mentor) throw new Error("Mentor profile not found");

    const message = `Hello ${mentor.full_name},\n\nYou have been promoted to Mentor on Creators Control. This decision was based on your content quality, consistency, and overall contribution to the platform.\n\nAs a mentor, your responsibilities include:\n\n1. Reviewing assigned videos in the "Content Review" tab.\n2. Reaching out to creators via DM with specific, actionable feedback.\n3. Sharing examples of effective content and explaining what makes them work.\n\nA new "Content Review" tab is now available in your account. Assignments will appear there as they are created. Please respond to new assignments in a timely manner.\n\nThank you for taking on this role.\n\n— The Creators Control team`;

    await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_id: mentor.user_id,
        title: "You have been promoted to Mentor",
        message,
        notification_type: "general",
        link: "/creator/content-review",
        button_text: "Open Content Review",
      }),
    });

    console.log("Mentor promotion personal email sent to:", mentor.full_name);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-mentor-promoted:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
