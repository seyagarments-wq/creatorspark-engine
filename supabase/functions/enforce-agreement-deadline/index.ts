import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find every active, required agreement whose deadline has passed
  const { data: expired, error } = await supabase
    .from("agreements")
    .select("id, title, audience, accept_deadline")
    .eq("is_active", true)
    .eq("required", true)
    .not("accept_deadline", "is", null)
    .lt("accept_deadline", new Date().toISOString());

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let offboarded = 0;
  const offboardedUserIds: { user_id: string; reason: string }[] = [];

  for (const ag of expired ?? []) {
    // Resolve the targeted creator profile_ids
    const targetCreatorIds = new Set<string>();

    if (ag.audience === "all") {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, user_id, status")
        .neq("status", "inactive");
      profs?.forEach((p) => targetCreatorIds.add(p.id));
    } else {
      const { data: targets } = await supabase
        .from("agreement_targets")
        .select("cohort_id, creator_id")
        .eq("agreement_id", ag.id);

      const creatorIds = (targets ?? []).map((t) => t.creator_id).filter(Boolean) as string[];
      const cohortIds = (targets ?? []).map((t) => t.cohort_id).filter(Boolean) as string[];

      creatorIds.forEach((id) => targetCreatorIds.add(id));

      if (cohortIds.length) {
        const { data: members } = await supabase
          .from("creator_cohort_members")
          .select("creator_id")
          .in("cohort_id", cohortIds);
        members?.forEach((m) => targetCreatorIds.add(m.creator_id));
      }
    }

    if (targetCreatorIds.size === 0) continue;

    // Find unaccepted creators within target set
    const { data: accepted } = await supabase
      .from("agreement_acceptances")
      .select("creator_id")
      .eq("agreement_id", ag.id);

    const acceptedSet = new Set((accepted ?? []).map((a) => a.creator_id));
    const unacceptedCreatorIds = [...targetCreatorIds].filter((id) => !acceptedSet.has(id));

    if (unacceptedCreatorIds.length === 0) continue;

    // Soft-offboard: profiles.status = 'inactive'
    const { data: updated } = await supabase
      .from("profiles")
      .update({ status: "inactive" })
      .in("id", unacceptedCreatorIds)
      .neq("status", "inactive")
      .select("user_id");

    if (updated) {
      offboarded += updated.length;
      updated.forEach((p) => offboardedUserIds.push({ user_id: p.user_id, reason: `missed agreement deadline: ${ag.title}` }));
    }
  }

  // Fire offboarded notifications via send-notification-email
  for (const { user_id, reason } of offboardedUserIds) {
    await supabase.functions.invoke("send-notification-email", {
      body: {
        user_id,
        title: "Your account has been paused",
        message: `Your account was set to inactive (${reason}). Reach out to your admin to reactivate.`,
        notification_type: "general",
      },
    }).catch((e) => console.error("notify failed", e));
  }

  return new Response(
    JSON.stringify({ checked: expired?.length ?? 0, offboarded }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
