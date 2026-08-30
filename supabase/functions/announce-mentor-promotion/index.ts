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

    // Get mentor profile
    const { data: mentor } = await supabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("id", mentor_profile_id)
      .single();

    if (!mentor) throw new Error("Mentor profile not found");

    // Find which cohort(s) this mentor belongs to
    const { data: cohortMemberships } = await supabase
      .from("creator_cohort_members")
      .select("cohort_id")
      .eq("creator_id", mentor_profile_id);

    if (!cohortMemberships || cohortMemberships.length === 0) {
      console.log("Mentor has no cohort memberships, skipping announcement");
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const cohortIds = cohortMemberships.map(cm => cm.cohort_id);

    // Get cohort names
    const { data: cohorts } = await supabase
      .from("creator_cohorts")
      .select("id, name")
      .in("id", cohortIds);

    const cohortNames = cohorts?.map(c => c.name).join(", ") || "your cohort";

    // Get all creators in those cohorts (excluding the mentor)
    const { data: cohortMembers } = await supabase
      .from("creator_cohort_members")
      .select("creator_id")
      .in("cohort_id", cohortIds)
      .neq("creator_id", mentor_profile_id);

    if (!cohortMembers || cohortMembers.length === 0) {
      console.log("No other cohort members to notify");
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const creatorIds = [...new Set(cohortMembers.map(cm => cm.creator_id))];

    // Get user_ids for all cohort members
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id")
      .in("id", creatorIds);

    if (!profiles) {
      throw new Error("Could not fetch cohort member profiles");
    }

    const mentorName = mentor.full_name;

    const subject = `${mentorName} just got promoted. Here's why that matters to you. 🎯`;
    const message = `Big news from the show! 🎊🎯\n\n${mentorName} has been absolutely killing it and has just been promoted to Mentor status in ${cohortNames}! 🛡️\n\nThey've been playing harder than anyone, consistently delivering quality content, and the judges have taken notice. ${mentorName} is now your team captain — they'll be helping review content, giving feedback, and making sure everyone in the cohort levels up together.\n\nHere's why this matters: in a few months, you'll see why the teams and cohorts are so important. There are going to be group challenges and competitions with prizes starting as low as $1,000. 💰\n\nThe stronger your team, the better your chances. So keep playing, keep posting, and who knows — you could be next. 💪🎯`;

    // Send to each cohort member
    const sendPromises = profiles.map(p =>
      fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_id: p.user_id,
          title: subject,
          message,
          notification_type: "general",
          link: "/creator/leaderboard",
          button_text: "See the Leaderboard",
        }),
      }).catch(err => console.error("Failed to notify:", p.user_id, err))
    );

    await Promise.all(sendPromises);
    console.log(`Mentor promotion announced to ${profiles.length} cohort members`);

    return new Response(JSON.stringify({ success: true, notified: profiles.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in announce-mentor-promotion:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
