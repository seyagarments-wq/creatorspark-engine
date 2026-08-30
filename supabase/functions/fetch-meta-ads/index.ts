import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_ERROR_CODES = {
  RATE_LIMIT: 80004,
  RATE_LIMIT_USER: 17,
  EXPIRED_TOKEN: 190,
};

const isRateLimitError = (code: number) =>
  code === META_ERROR_CODES.RATE_LIMIT || code === META_ERROR_CODES.RATE_LIMIT_USER;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { type = "ads" } = body;

    console.log(`Fetching Meta ${type}...`);

    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ error: "Meta Ads not connected", data: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id } = credentials;
    if (!access_token || !ad_account_id) {
      return new Response(
        JSON.stringify({ error: "Meta credentials incomplete", data: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountId = ad_account_id.replace("act_", "");

    const fieldsMap: Record<string, string> = {
      ads: "id,name,status,effective_status,campaign_id,adset_id",
      campaigns: "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
      adsets: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,targeting",
    };

    const endpoint = type === "campaigns" ? "campaigns" : type === "adsets" ? "adsets" : "ads";
    const fields = fieldsMap[type] || fieldsMap.ads;

    let allItems: any[] = [];
    let url: string | null = `https://graph.facebook.com/v21.0/act_${accountId}/${endpoint}?fields=${fields}&limit=100&access_token=${access_token}`;
    let retryCount = 0;
    
    while (url) {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.error) {
        if (isRateLimitError(data.error.code) && retryCount < 3) {
          const backoffMs = 30000 * Math.pow(2, retryCount) + Math.random() * 5000;
          console.log(`Rate limited (code ${data.error.code}), backoff ${Math.round(backoffMs / 1000)}s (attempt ${retryCount + 1}/3)`);
          await new Promise(r => setTimeout(r, backoffMs));
          retryCount++;
          continue;
        }

        console.error(`Error fetching ${type}:`, data.error);

        if (isRateLimitError(data.error.code)) {
          try {
            await supabase.from("meta_api_logs").insert({
              function_name: "fetch-meta-ads",
              error_code: data.error.code,
              error_type: data.error.type,
              error_message: data.error.message,
              error_subcode: data.error.error_subcode,
            });
          } catch (_) {}
        }

        return new Response(
          JSON.stringify({
            error: data.error.message,
            code: isRateLimitError(data.error.code) ? "RATE_LIMITED" : 
                  data.error.code === META_ERROR_CODES.EXPIRED_TOKEN ? "TOKEN_EXPIRED" : "API_ERROR",
            data: allItems,
            partial: allItems.length > 0,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      retryCount = 0;
      if (data.data) {
        allItems = [...allItems, ...data.data];
      }
      url = data.paging?.next || null;
    }

    console.log(`Fetched ${allItems.length} ${type} from Meta account`);

    // Upsert all objects into meta_objects table for structure/status tracking
    const level = type === "campaigns" ? "campaign" : type === "adsets" ? "adset" : "ad";
    if (allItems.length > 0) {
      const upsertRows = allItems.map(item => ({
        object_id: item.id,
        object_name: item.name || null,
        level,
        status: item.status || null,
        effective_status: item.effective_status || null,
        campaign_id: item.campaign_id || null,
        adset_id: item.adset_id || null,
        daily_budget: item.daily_budget ? parseFloat(item.daily_budget) / 100 : null,
        lifetime_budget: item.lifetime_budget ? parseFloat(item.lifetime_budget) / 100 : null,
        objective: item.objective || null,
        targeting: item.targeting || null,
        ad_account_id: `act_${accountId}`,
        meta_data: {},
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Batch upsert in chunks of 50
      for (let i = 0; i < upsertRows.length; i += 50) {
        const chunk = upsertRows.slice(i, i + 50);
        const { error: upsertError } = await supabase
          .from("meta_objects")
          .upsert(chunk, { onConflict: "object_id" });
        if (upsertError) {
          console.error("Error upserting meta_objects:", upsertError);
        }
      }
      console.log(`Upserted ${upsertRows.length} ${level}(s) into meta_objects`);
    }

    const formatted = allItems.map(item => ({
      id: item.id,
      name: item.name,
      status: item.effective_status || item.status,
      ...(item.objective && { objective: item.objective }),
      ...(item.daily_budget && { daily_budget: item.daily_budget }),
      ...(item.campaign_id && { campaign_id: item.campaign_id }),
    }));

    return new Response(
      JSON.stringify({ data: formatted, total: formatted.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-meta-ads:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", data: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
