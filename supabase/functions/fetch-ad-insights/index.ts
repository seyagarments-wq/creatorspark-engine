import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_ERROR_CODES = {
  EXPIRED_TOKEN: 190,
  RATE_LIMIT: 80004,
  MISSING_PERMISSIONS: 200,
  INVALID_PARAMETER: 100,
  API_SESSION: 102,
  API_UNKNOWN: 1,
  API_SERVICE: 2,
};

interface MetaError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const {
      level = "ad",
      date_preset = "last_7d",
      time_range,
      object_id,
      store_results = true,
    } = body;

    console.log(`Fetching ad insights: level=${level}, date_preset=${date_preset}, object_id=${object_id || 'all'}`);

    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      // Return HTTP 200 with error in body
      return new Response(
        JSON.stringify({ error: "Meta Ads not connected", code: "NO_CREDENTIALS" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id } = credentials;
    if (!access_token || !ad_account_id) {
      return new Response(
        JSON.stringify({ error: "Meta credentials incomplete", code: "INCOMPLETE_CREDENTIALS" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountId = ad_account_id.replace("act_", "");

    const fields = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,reach,ctr,cpc,cpm,actions,action_values";
    let endpoint: string;
    
    if (object_id) {
      endpoint = `https://graph.facebook.com/v21.0/${object_id}/insights`;
    } else {
      endpoint = `https://graph.facebook.com/v21.0/act_${accountId}/insights`;
    }

    const params = new URLSearchParams({
      access_token,
      fields,
      level: object_id ? "ad" : level,
    });

    if (time_range?.since && time_range?.until) {
      params.append("time_range", JSON.stringify(time_range));
    } else {
      params.append("date_preset", date_preset);
    }

    if (!object_id) {
      params.append("limit", "500");
    }

    const url = `${endpoint}?${params.toString()}`;
    console.log(`Calling Meta API: ${endpoint}`);

    let response = await fetch(url);
    let data = await response.json();

    if (data.error) {
      const metaError = data.error as MetaError;

      // Rate limit: exponential backoff with jitter, up to 2 retries
      if (metaError.code === META_ERROR_CODES.RATE_LIMIT) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const backoffMs = Math.min(5000 * Math.pow(2, attempt) + Math.random() * 2000, 30000);
          console.log(`Rate limited, backoff ${Math.round(backoffMs / 1000)}s (attempt ${attempt + 1}/2)`);
          await new Promise(r => setTimeout(r, backoffMs));
          response = await fetch(url);
          data = await response.json();
          if (!data.error) break;
        }
      }

      // If still an error after retry
      if (data.error) {
        const finalError = data.error as MetaError;
        console.error("Meta API error:", finalError);
        await logApiError(supabase, "fetch-ad-insights", finalError, url, body);

        if (finalError.code === META_ERROR_CODES.EXPIRED_TOKEN) {
          await supabase
            .from("meta_credentials")
            .update({ status: "expired" })
            .eq("id", credentials.id);
        }

        // Always return HTTP 200 with error details in body
        return new Response(
          JSON.stringify({
            error: finalError.message,
            code: getErrorCode(finalError.code),
            meta_error: finalError,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const insights = parseInsights(data.data || []);
    console.log(`Fetched ${insights.length} insight records`);

    if (store_results && insights.length > 0) {
      await storeInsights(supabase, insights, ad_account_id, level, date_preset);
    }

    const summary = calculateSummary(insights);

    return new Response(
      JSON.stringify({
        success: true,
        insights,
        summary,
        count: insights.length,
        level,
        date_preset: time_range ? null : date_preset,
        time_range: time_range || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-ad-insights:", error);
    await logApiError(supabase, "fetch-ad-insights", {
      message: error instanceof Error ? error.message : "Unknown error",
      type: "InternalError",
      code: 0,
    });
    
    // Return HTTP 200 even for internal errors
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", code: "INTERNAL_ERROR" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseInsights(rawData: any[]) {
  return rawData.map(item => {
    const impressions = parseInt(item.impressions || "0");
    const clicks = parseInt(item.clicks || "0");
    const spend = parseFloat(item.spend || "0");
    const reach = parseInt(item.reach || "0");
    
    let conversions = 0;
    let conversionValue = 0;
    
    if (item.actions) {
      const purchaseAction = item.actions.find(
        (a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase"
      );
      if (purchaseAction) conversions = parseInt(purchaseAction.value || "0");
    }
    
    if (item.action_values) {
      const revenueAction = item.action_values.find(
        (a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase"
      );
      if (revenueAction) conversionValue = parseFloat(revenueAction.value || "0");
    }
    
    return {
      object_id: item.ad_id || item.adset_id || item.campaign_id || item.id || "",
      object_name: item.ad_name || item.adset_name || item.campaign_name,
      campaign_id: item.campaign_id || "",
      adset_id: item.adset_id || "",
      impressions,
      clicks,
      spend,
      reach,
      ctr: parseFloat(item.ctr || "0"),
      cpc: parseFloat(item.cpc || "0"),
      cpm: parseFloat(item.cpm || "0"),
      conversions,
      conversion_value: conversionValue,
      date_start: item.date_start,
      date_stop: item.date_stop,
    };
  });
}

async function storeInsights(supabase: any, insights: any[], adAccountId: string, level: string, datePreset: string | null) {
  for (const insight of insights) {
    const record = {
      ad_account_id: adAccountId,
      level,
      object_id: insight.object_id,
      object_name: insight.object_name,
      campaign_id: insight.campaign_id || "",
      adset_id: insight.adset_id || "",
      impressions: insight.impressions,
      clicks: insight.clicks,
      spend: insight.spend,
      reach: insight.reach,
      ctr: insight.ctr,
      cpc: insight.cpc,
      cpm: insight.cpm,
      conversions: insight.conversions,
      conversion_value: insight.conversion_value,
      date_start: insight.date_start,
      date_stop: insight.date_stop,
      date_preset: datePreset,
      fetched_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("ad_insights")
      .upsert(record, { onConflict: "object_id,date_start,date_stop,level", ignoreDuplicates: false });
    
    if (error) console.error(`Error storing insight for ${insight.object_id}:`, error);
  }
}

function calculateSummary(insights: any[]) {
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalReach = insights.reduce((s, i) => s + i.reach, 0);
  const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
  const totalConversionValue = insights.reduce((s, i) => s + i.conversion_value, 0);
  
  return {
    total_impressions: totalImpressions,
    total_clicks: totalClicks,
    total_spend: totalSpend,
    total_reach: totalReach,
    total_conversions: totalConversions,
    total_conversion_value: totalConversionValue,
    avg_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    avg_cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
    roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
  };
}

async function logApiError(supabase: any, functionName: string, error: any, requestUrl?: string, requestParams?: any) {
  if (!error) return;
  try {
    await supabase.from("meta_api_logs").insert({
      function_name: functionName,
      error_code: error.code,
      error_type: error.type,
      error_message: error.message,
      error_subcode: error.error_subcode,
      fbtrace_id: error.fbtrace_id,
      request_url: requestUrl,
      request_params: requestParams,
      response_data: error,
    });
  } catch (_) { /* ignore */ }
}

function getErrorCode(metaCode: number | undefined): string {
  switch (metaCode) {
    case META_ERROR_CODES.EXPIRED_TOKEN: return "TOKEN_EXPIRED";
    case META_ERROR_CODES.RATE_LIMIT: return "RATE_LIMITED";
    case META_ERROR_CODES.MISSING_PERMISSIONS: return "MISSING_PERMISSIONS";
    case META_ERROR_CODES.INVALID_PARAMETER: return "INVALID_PARAMETER";
    case META_ERROR_CODES.API_SESSION: return "SESSION_ERROR";
    case META_ERROR_CODES.API_SERVICE: return "SERVICE_ERROR";
    default: return "API_ERROR";
  }
}
