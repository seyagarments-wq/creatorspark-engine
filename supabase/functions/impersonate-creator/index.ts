import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { creator_user_id } = await req.json();
    if (!creator_user_id) {
      return new Response(JSON.stringify({ error: "creator_user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a magic link for the creator
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: "", // will be overridden
      options: {},
    });

    // Instead of magic link (which needs email), use signInWithPassword approach:
    // We'll generate a temporary password, set it, and return credentials
    // Actually, best approach: use admin.generateLink with the creator's email

    // Get creator email
    const { data: creatorUser, error: userError } = await adminClient.auth.admin.getUserById(creator_user_id);
    if (userError || !creatorUser?.user) {
      return new Response(JSON.stringify({ error: "Creator not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creatorEmail = creatorUser.user.email!;

    // Generate magic link
    const { data: magicData, error: magicError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: creatorEmail,
    });

    if (magicError || !magicData) {
      console.error("Magic link error:", magicError);
      return new Response(JSON.stringify({ error: "Failed to generate link" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The generated link contains a token - we need to construct the proper URL
    const { properties } = magicData;
    const token = properties?.hashed_token;
    const redirectUrl = `${supabaseUrl}/auth/v1/verify?token=${token}&type=magiclink&redirect_to=${encodeURIComponent(req.headers.get("origin") || supabaseUrl + "/creator")}`;

    return new Response(JSON.stringify({ 
      url: redirectUrl,
      email: creatorEmail,
      note: "Open this URL in an incognito window to browse as this creator"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
