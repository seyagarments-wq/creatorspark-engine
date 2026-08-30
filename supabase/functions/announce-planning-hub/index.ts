import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function wrapEmail(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:white;padding:10px 20px;border-radius:10px;font-weight:700;font-size:18px;letter-spacing:-0.3px;">Creatorsctrl</span>
    </div>
    ${bodyHtml}
    <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#a1a1aa;font-size:12px;margin:0;">Creatorsctrl &bull; Manage preferences in your profile settings</p>
    </div>
  </div>
</body>
</html>`;
}

const p = (text: string) => `<p style="color:#4b5563;font-size:16px;margin:0 0 12px 0;line-height:1.6;">${text}</p>`;
const pBold = (text: string) => `<p style="color:#1f2937;font-size:16px;margin:0 0 12px 0;line-height:1.6;font-weight:600;">${text}</p>`;

function getMentorEmailHtml(name: string): string {
  const firstName = name || "there";
  return wrapEmail(`
    ${pBold(`${firstName},`)}
    ${p(`You're fired.`)}
    ${p(`…if you don't start using this.`)}
    ${p(`Your <strong>Planning Hub</strong> is live.`)}
    ${p(`This is where you stop your creators from filming garbage.`)}
    ${p(`Right now they're guessing. Guessing what to wear. Guessing the setup. Guessing the hook. Then they hit record and send you something you have to reject.`)}
    ${p(`That loop is done.`)}
    ${p(`Here's how it works now:`)}
    ${p(`<strong>1. They show you their setup BEFORE they film.</strong><br/>Location. Outfit. Props. Lighting. You see it, you fix it, they film it right the first time.`)}
    ${p(`<strong>2. You drop in video refs so they stop copying the wrong things.</strong><br/>Mark the exact timestamps. Show them what good looks like. No more "I thought this was the vibe."`)
    }
    ${p(`<strong>3. You workshop scripts together.</strong><br/>If the hook sucks, you catch it before they waste a take. Not after.`)}
    ${p(`No more back-and-forth after the video's already shot.`)}
    ${p(`No more "can you re-film this."`)
    }
    ${p(`Fix it before they hit record. That's the whole point.`)}
    <div style="text-align:center;margin:28px 0 12px 0;">
      <a href="https://creatorsctrl.com/creator/planning" style="display:inline-block;background-color:#8B5CF6;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Open Planning Hub</a>
    </div>
    ${p(`Go pick a creator and start building.`)}
    ${p(`— Haley`)}
  `);
}

function getCreatorEmailHtml(name: string, mentorName: string): string {
  const firstName = name || "there";
  return wrapEmail(`
    ${pBold(`${firstName},`)}
    ${p(`You've been filming blind.`)}
    ${p(`Setting up your phone, picking an outfit, writing a hook… all by yourself. Then you hit record, send it in, and pray it doesn't get rejected.`)}
    ${p(`That's over.`)}
    ${p(`Your <strong>Planning Hub</strong> with ${mentorName} is live.`)}
    ${p(`Before your next video, here's exactly what you're going to do:`)}
    ${p(`<strong>Show ${mentorName} your setup.</strong><br/>Snap a few photos — location, outfit, props. Send them in. Get adjustments BEFORE you waste a take.`)}
    ${p(`<strong>Study the refs ${mentorName} drops in.</strong><br/>Watch them. Copy the techniques. Stop guessing what "good" looks like.`)}
    ${p(`<strong>Lock in your script.</strong><br/>Draft it, get ${mentorName}'s notes, fix the hook. THEN hit record.`)}
    ${p(`No more guessing.<br/>No more wasted takes.<br/>No more "can you re-film this."`)
    }
    ${p(`This is how you level up.`)}
    <div style="text-align:center;margin:28px 0 12px 0;">
      <a href="https://creatorsctrl.com/creator/plan" style="display:inline-block;background-color:#8B5CF6;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Open Your Planning Hub</a>
    </div>
    ${p(`Stop filming blind. Plan it. Get feedback. Then film.`)}
  `);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && authHeader.split(" ")[1] !== supabaseServiceKey) {
      const token = authHeader.split(" ")[1];
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();
      if (!role) {
        return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    console.log("[PLANNING-HUB-ANNOUNCE] Starting...");

    const { data: assignments, error: assignErr } = await supabase
      .from("mentor_creator_assignments")
      .select("mentor_id, creator_id")
      .eq("status", "active");

    if (assignErr) throw assignErr;
    if (!assignments || assignments.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No active mentor-creator assignments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allProfileIds = [...new Set([
      ...assignments.map((a) => a.mentor_id),
      ...assignments.map((a) => a.creator_id),
    ])];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, email, email_notifications, is_mentor")
      .in("id", allProfileIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    let sent = 0;
    const errors: string[] = [];
    const emailedUserIds = new Set<string>();

    // Mentors
    const mentorIds = [...new Set(assignments.map((a) => a.mentor_id))];
    for (const mentorId of mentorIds) {
      const mentor = profileMap.get(mentorId);
      if (!mentor?.email || !mentor.email_notifications || emailedUserIds.has(mentor.user_id)) continue;
      emailedUserIds.add(mentor.user_id);
      const firstName = mentor.full_name?.split(" ")[0] || "there";

      try {
        await supabase.from("notifications").insert({
          user_id: mentor.user_id,
          title: "Planning Hub is live",
          message: "Your creators are filming blind. Fix it before they hit record.",
          notification_type: "general",
          link: "/creator/planning",
        });

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Creatorsctrl <noreply@seyagarments.com>",
            to: [mentor.email],
            subject: `${firstName} YOU R FIRED!`,
            html: getMentorEmailHtml(firstName),
          }),
        });
        if (emailRes.ok) sent++;
        else errors.push(`mentor ${mentorId}: ${await emailRes.text()}`);
      } catch (e) {
        errors.push(`mentor ${mentorId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Creators
    const creatorIds = [...new Set(assignments.map((a) => a.creator_id))];
    for (const creatorId of creatorIds) {
      const creator = profileMap.get(creatorId);
      if (!creator?.email || !creator.email_notifications || emailedUserIds.has(creator.user_id)) continue;
      emailedUserIds.add(creator.user_id);

      const assignment = assignments.find((a) => a.creator_id === creatorId);
      const mentor = assignment ? profileMap.get(assignment.mentor_id) : null;
      const mentorName = mentor?.full_name?.split(" ")[0] || "your mentor";
      const firstName = creator.full_name?.split(" ")[0] || "there";

      try {
        await supabase.from("notifications").insert({
          user_id: creator.user_id,
          title: "GET ON THIS NOW",
          message: `Stop filming blind. Your Planning Hub with ${mentorName} is live.`,
          notification_type: "general",
          link: "/creator/plan",
        });

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Creatorsctrl <noreply@seyagarments.com>",
            to: [creator.email],
            subject: `${firstName} GET ON THIS NOW`,
            html: getCreatorEmailHtml(firstName, mentorName),
          }),
        });
        if (emailRes.ok) sent++;
        else errors.push(`creator ${creatorId}: ${await emailRes.text()}`);
      } catch (e) {
        errors.push(`creator ${creatorId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log(`[PLANNING-HUB-ANNOUNCE] Done. Sent: ${sent}, Errors: ${errors.length}`);

    return new Response(JSON.stringify({ success: true, sent, total: emailedUserIds.size, errors: errors.length > 0 ? errors : undefined }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[PLANNING-HUB-ANNOUNCE] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
