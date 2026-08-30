import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? "status";

    // Does the platform already have an owner/admin?
    const { count, error: countError } = await supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) throw new Error(countError.message);
    const adminExists = (count ?? 0) > 0;

    if (action === "status") {
      return json({ needsSetup: !adminExists });
    }

    if (action !== "create") return json({ error: "Unknown action" }, 400);

    if (adminExists) {
      return json({ error: "This platform has already been set up. Ask an existing admin for an invite." }, 409);
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const brandName = String(body.brand_name ?? "").trim();
    const websiteUrl = String(body.website_url ?? "").trim();
    const commissionRate = Number(body.commission_rate ?? 10);

    if (!email.includes("@")) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (fullName.length < 2) return json({ error: "Enter your full name." }, 400);
    if (brandName.length < 2) return json({ error: "Enter your brand name." }, 400);

    // 1. Create the auth user (auto-confirmed so they can sign in immediately)
    const { data: created, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (authError) return json({ error: authError.message }, 400);

    const userId = created.user.id;

    // 2. Profile
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: userId,
        email,
        full_name: fullName,
        status: "active",
      });
      if (profileError) console.error("profile insert failed", profileError);
    }

    // 3. Admin role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleError) {
      console.error("role insert failed", roleError);
      return json({ error: `Account created but admin role failed: ${roleError.message}` }, 500);
    }

    // 4. Brand — reuse the seeded row if there is exactly one, otherwise create
    const { data: brands } = await supabase.from("brands").select("id").limit(2);
    const brandPayload = {
      name: brandName,
      website_url: websiteUrl || null,
      commission_rate: Number.isFinite(commissionRate) ? commissionRate : 10,
      is_active: true,
    };

    if (brands && brands.length === 1) {
      await supabase.from("brands").update(brandPayload).eq("id", brands[0].id);
    } else if (!brands || brands.length === 0) {
      await supabase.from("brands").insert(brandPayload);
    }

    return json({ success: true, user_id: userId });
  } catch (error) {
    console.error("owner-bootstrap error", error);
    return json({ error: (error as Error).message }, 500);
  }
});
