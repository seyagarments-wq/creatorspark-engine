import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Provisions an invited account server-side in one step:
// validate token -> create (or claim) the auth user, already confirmed -> profile -> role
// -> brand -> mark the invite used. The client then signs in with the password.
//
// This replaces the old client-side flow in Landing.tsx, which called auth.signUp and then
// tried to insert profile/role from the browser. With email confirmation on, signUp returns
// no session, so every one of those inserts died on RLS and the creator was left with a bare
// auth user they could not log in with.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed", code: "method_not_allowed" }, 405);

  let body: { token?: unknown; password?: unknown; full_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body.", code: "bad_request" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";

  if (!token) return json({ error: "Invite token is required.", code: "bad_request" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters.", code: "weak_password" }, 400);
  if (fullName.length < 2) return json({ error: "Enter your full name.", code: "bad_request" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // 1. The invite must exist, be unused and unexpired.
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("id, email, role, brand_id")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite) return json({ error: "This invite link is invalid or has expired.", code: "invalid_invite" }, 410);

    const email = String(invite.email).trim().toLowerCase();

    // 2. Is there already an auth user for this email? If it has a role it is a real account.
    //    If it has none, it was created by the old signup and never finished: claim it.
    const { data: existingId, error: lookupError } = await supabase.rpc("auth_user_id_for_email", { _email: email });
    if (lookupError) throw lookupError;

    let userId: string;
    let createdHere = false;

    if (existingId) {
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", existingId)
        .maybeSingle();
      if (existingRole) {
        return json(
          { error: "An account with this email already exists. Sign in, or use Forgot password.", code: "account_exists" },
          409,
        );
      }
      const { error: updateError } = await supabase.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (updateError) {
        const weak = /password/i.test(updateError.message);
        return json({ error: updateError.message, code: weak ? "weak_password" : "create_failed" }, weak ? 400 : 500);
      }
      userId = existingId;
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError || !created?.user) {
        const msg = createError?.message ?? "Could not create the account.";
        const weak = /password/i.test(msg);
        return json({ error: msg, code: weak ? "weak_password" : "create_failed" }, weak ? 400 : 500);
      }
      userId = created.user.id;
      createdHere = true;
    }

    // 3. Profile, role, brand, invite. If anything fails on a user created in this call, remove
    //    the user again so the creator can simply retry the same link.
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ user_id: userId, email, full_name: fullName, status: "active" }, { onConflict: "user_id" });
      if (profileError) throw profileError;

      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: invite.role }, { onConflict: "user_id" });
      if (roleError) throw roleError;

      if (invite.role === "creator" && invite.brand_id) {
        const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userId).single();
        if (profile) {
          const { error: brandError } = await supabase
            .from("creator_brands")
            .upsert(
              { creator_id: profile.id, brand_id: invite.brand_id, status: "active" },
              { onConflict: "creator_id,brand_id", ignoreDuplicates: true },
            );
          if (brandError) console.error("creator_brands upsert failed", brandError);
        }
      }

      const { error: usedError } = await supabase
        .from("invites")
        .update({ used_at: new Date().toISOString() })
        .eq("id", invite.id);
      if (usedError) throw usedError;
    } catch (provisionError) {
      console.error("accept-invite provisioning failed", provisionError);
      if (createdHere) {
        const { error: cleanupError } = await supabase.auth.admin.deleteUser(userId);
        if (cleanupError) console.error("cleanup deleteUser failed", cleanupError);
      }
      return json({ error: "Account setup failed. Please open the invite link and try again.", code: "provision_failed" }, 500);
    }

    return json({ success: true, email, role: invite.role });
  } catch (error) {
    console.error("accept-invite error", error);
    return json({ error: (error as Error).message ?? "Unexpected error", code: "server_error" }, 500);
  }
});
