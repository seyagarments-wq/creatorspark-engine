import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, object_id } = body;

    if (!action || !object_id) {
      return new Response(
        JSON.stringify({ error: "Missing action or object_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token
    const { data: creds, error: credErr } = await supabase
      .from("meta_credentials")
      .select("access_token")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (credErr || !creds?.access_token) {
      return new Response(
        JSON.stringify({ error: "No Meta credentials found", code: "NO_CREDENTIALS" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = creds.access_token;
    let metaResponse: any;

    if (action === "update_status") {
      const { status } = body; // ACTIVE | PAUSED | ARCHIVED
      if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) {
        return new Response(
          JSON.stringify({ error: "Invalid status. Use ACTIVE, PAUSED, or ARCHIVED" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      metaResponse = await callMetaApi(accessToken, object_id, { status });
    } else if (action === "update_ad") {
      const params: Record<string, string> = {};
      if (body.name) params.name = body.name;
      if (body.status) params.status = body.status;
      if (body.primary_text || body.headline || body.cta || body.landing_url) {
        const adData = await fetchMetaApi(accessToken, object_id, "creative{id,object_story_spec}");
        if (adData?.creative?.id) {
          const spec = adData.creative.object_story_spec || {};
          if (spec.video_data) {
            if (body.primary_text) spec.video_data.message = body.primary_text;
            if (body.headline) spec.video_data.title = body.headline;
            if (body.landing_url) spec.video_data.link = body.landing_url;
            if (body.cta) {
              spec.video_data.call_to_action = {
                type: body.cta,
                value: { link: body.landing_url || spec.video_data.link },
              };
            }
          } else if (spec.link_data) {
            if (body.primary_text) spec.link_data.message = body.primary_text;
            if (body.headline) spec.link_data.name = body.headline;
            if (body.landing_url) spec.link_data.link = body.landing_url;
            if (body.cta) {
              spec.link_data.call_to_action = {
                type: body.cta,
                value: { link: body.landing_url || spec.link_data.link },
              };
            }
          }
          await callMetaApi(accessToken, adData.creative.id, { object_story_spec: JSON.stringify(spec) });
        }
      }
      if (Object.keys(params).length > 0) {
        metaResponse = await callMetaApi(accessToken, object_id, params);
      } else {
        metaResponse = { success: true };
      }
    } else if (action === "update_adset") {
      const params: Record<string, string> = {};
      if (body.name) params.name = body.name;
      if (body.status) params.status = body.status;
      if (body.daily_budget != null) params.daily_budget = String(Math.round(body.daily_budget * 100));
      metaResponse = await callMetaApi(accessToken, object_id, params);
    } else if (action === "update_campaign") {
      const params: Record<string, string> = {};
      if (body.name) params.name = body.name;
      if (body.status) params.status = body.status;
      if (body.daily_budget != null) params.daily_budget = String(Math.round(body.daily_budget * 100));
      metaResponse = await callMetaApi(accessToken, object_id, params);
    } else if (action === "duplicate") {
      // Duplicate a campaign, adset, or ad using Meta's copy endpoint
      const copyParams: Record<string, string> = {};
      if (body.new_name) copyParams.rename_options = JSON.stringify({ rename_suffix: ` - ${body.new_name}` });
      if (body.status_option) copyParams.status_option = body.status_option; // PAUSED or INHERITED
      
      const res = await fetch(`${GRAPH_API}/${object_id}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: accessToken, ...copyParams }),
      });
      metaResponse = await res.json();
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for Meta API errors
    if (metaResponse?.error) {
      await supabase.from("meta_api_logs").insert({
        function_name: "manage-meta-ads",
        error_code: metaResponse.error.code,
        error_subcode: metaResponse.error.error_subcode,
        error_type: metaResponse.error.type,
        error_message: metaResponse.error.message,
        fbtrace_id: metaResponse.error.fbtrace_id,
        request_params: body,
      });

      return new Response(
        JSON.stringify({
          error: metaResponse.error.message || "Meta API error",
          code: "META_API_ERROR",
          details: metaResponse.error,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // After successful action, update meta_objects to keep in sync
    if (action === "update_status") {
      await supabase.from("meta_objects").update({
        status: body.status,
        effective_status: body.status,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("object_id", object_id);
    } else if (action === "update_ad" || action === "update_adset" || action === "update_campaign") {
      const updates: Record<string, any> = { updated_at: new Date().toISOString(), synced_at: new Date().toISOString() };
      if (body.name) updates.object_name = body.name;
      if (body.status) { updates.status = body.status; updates.effective_status = body.status; }
      if (body.daily_budget != null) updates.daily_budget = body.daily_budget;
      await supabase.from("meta_objects").update(updates).eq("object_id", object_id);
    }

    return new Response(
      JSON.stringify({ success: true, data: metaResponse }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("manage-meta-ads error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function callMetaApi(
  accessToken: string,
  objectId: string,
  params: Record<string, string>
): Promise<any> {
  const formData = new URLSearchParams();
  formData.append("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value);
  }

  const res = await fetch(`${GRAPH_API}/${objectId}`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

async function fetchMetaApi(
  accessToken: string,
  objectId: string,
  fields: string
): Promise<any> {
  const res = await fetch(
    `${GRAPH_API}/${objectId}?fields=${encodeURIComponent(fields)}&access_token=${accessToken}`
  );
  return res.json();
}
