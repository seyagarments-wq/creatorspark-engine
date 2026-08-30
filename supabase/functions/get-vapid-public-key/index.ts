import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Validate JWT (defense-in-depth; platform may also enforce JWT)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(
      token
    );
    if (claimsError || !claimsData?.claims) {
      console.log("get-vapid-public-key: JWT validation failed", {
        error: claimsError?.message,
      });
      return json({ error: "Unauthorized" }, 401);
    }

    const publicKey =
      (await getSecret("VAPID_PUBLIC_KEY")) ||
      (await getSecret("VITE_VAPID_PUBLIC_KEY")) ||
      "";

    if (!publicKey) {
      return json({ error: "VAPID public key not configured" }, 500);
    }

    return json({ publicKey });
  } catch (error: any) {
    console.error("get-vapid-public-key error:", error);
    return json({ error: error?.message ?? "Internal error" }, 500);
  }
});
