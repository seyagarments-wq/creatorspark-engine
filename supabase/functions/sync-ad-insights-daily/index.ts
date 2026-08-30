import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Meta API error codes
const META_ERROR_CODES = {
  EXPIRED_TOKEN: 190,
  RATE_LIMIT: 80004,
  MISSING_PERMISSIONS: 200,
};

interface SyncResult {
  success: boolean;
  campaigns_synced: number;
  adsets_synced: number;
  ads_synced: number;
  total_impressions: number;
  total_spend: number;
  errors: string[];
  duration_ms: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const errors: string[] = [];

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log("Starting daily ad insights sync...");

    // Fetch Meta credentials
    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      console.log("No Meta credentials found, skipping sync");
      
      // Notify admins if credentials are missing
      await notifyAdmins(supabase, "Meta Ads Sync Failed", "No connected Meta account found. Please reconnect in Settings.");
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Meta Ads not connected",
          errors: ["No Meta credentials found"],
          duration_ms: Date.now() - startTime 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id, expires_at } = credentials;

    if (!access_token || !ad_account_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Meta credentials incomplete",
          errors: ["Missing access token or ad account ID"],
          duration_ms: Date.now() - startTime 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check token expiry
    if (expires_at && new Date(expires_at) < new Date()) {
      await supabase
        .from("meta_credentials")
        .update({ status: "expired" })
        .eq("id", credentials.id);
      
      await notifyAdmins(supabase, "Meta Token Expired", "Your Meta access token has expired. Please reconnect in Settings.");
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Token expired",
          errors: ["Access token has expired"],
          duration_ms: Date.now() - startTime 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountId = ad_account_id.replace("act_", "");

    // Define date ranges to sync (yesterday and last 7 days for comprehensive data)
    const datePresets = ["today", "yesterday", "last_7d"];
    const levels = ["campaign", "adset", "ad"] as const;

    let campaignsSynced = 0;
    let adsetsSynced = 0;
    let adsSynced = 0;
    let totalImpressions = 0;
    let totalSpend = 0;

    for (const datePreset of datePresets) {
      for (const level of levels) {
        try {
          const result = await fetchAndStoreInsights(
            supabase,
            access_token,
            accountId,
            ad_account_id,
            level,
            datePreset
          );

          if (result.error) {
            errors.push(`${level}/${datePreset}: ${result.error}`);
            
            // Handle critical errors
            if (result.errorCode === META_ERROR_CODES.EXPIRED_TOKEN) {
              await supabase
                .from("meta_credentials")
                .update({ status: "expired" })
                .eq("id", credentials.id);
              
              await notifyAdmins(supabase, "Meta Token Expired", "Your Meta access token has expired during sync. Please reconnect in Settings.");
              
              return new Response(
                JSON.stringify({ 
                  success: false, 
                  error: "Token expired during sync",
                  errors,
                  duration_ms: Date.now() - startTime 
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            
            continue;
          }

          if (level === "campaign") campaignsSynced += result.count;
          else if (level === "adset") adsetsSynced += result.count;
          else adsSynced += result.count;

          totalImpressions += result.impressions;
          totalSpend += result.spend;

          console.log(`Synced ${result.count} ${level}s for ${datePreset}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${level}/${datePreset}: ${errorMessage}`);
          console.error(`Error syncing ${level} for ${datePreset}:`, error);
        }
      }
    }

    // Update last sync timestamp
    await supabase
      .from("meta_credentials")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", credentials.id);

    const duration = Date.now() - startTime;
    console.log(`Daily sync complete in ${duration}ms. Campaigns: ${campaignsSynced}, Adsets: ${adsetsSynced}, Ads: ${adsSynced}`);

    // If there were errors but we still synced some data, send a warning
    if (errors.length > 0) {
      await notifyAdmins(
        supabase, 
        "Meta Ads Sync Completed with Warnings",
        `Synced ${campaignsSynced + adsetsSynced + adsSynced} items but encountered ${errors.length} errors. Check logs for details.`
      );
    }

    const result: SyncResult = {
      success: true,
      campaigns_synced: campaignsSynced,
      adsets_synced: adsetsSynced,
      ads_synced: adsSynced,
      total_impressions: totalImpressions,
      total_spend: totalSpend,
      errors,
      duration_ms: duration,
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Error in daily sync:", error);
    
    await logApiError(supabase, "sync-ad-insights-daily", {
      message: error instanceof Error ? error.message : "Unknown error",
      type: "InternalError",
      code: 0,
    });
    
    await notifyAdmins(supabase, "Meta Ads Sync Failed", `Daily sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        errors: [error instanceof Error ? error.message : "Unknown error"],
        duration_ms: duration 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchAndStoreInsights(
  supabase: any,
  accessToken: string,
  accountId: string,
  fullAccountId: string,
  level: "campaign" | "adset" | "ad",
  datePreset: string
): Promise<{ count: number; impressions: number; spend: number; error?: string; errorCode?: number }> {
  const fields = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,reach,ctr,cpc,cpm,actions,action_values";
  
  const url = `https://graph.facebook.com/v21.0/act_${accountId}/insights?` +
    `access_token=${accessToken}&` +
    `fields=${fields}&` +
    `level=${level}&` +
    `date_preset=${datePreset}&` +
    `limit=500`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    await logApiError(supabase, "sync-ad-insights-daily", data.error, url);
    return { count: 0, impressions: 0, spend: 0, error: data.error.message, errorCode: data.error.code };
  }

  if (!data.data || data.data.length === 0) {
    return { count: 0, impressions: 0, spend: 0 };
  }

  let totalImpressions = 0;
  let totalSpend = 0;

  for (const item of data.data) {
    const impressions = parseInt(item.impressions || "0");
    const clicks = parseInt(item.clicks || "0");
    const spend = parseFloat(item.spend || "0");
    const reach = parseInt(item.reach || "0");

    totalImpressions += impressions;
    totalSpend += spend;

    // Parse conversions
    let conversions = 0;
    let conversionValue = 0;

    if (item.actions) {
      const purchaseAction = item.actions.find(
        (a: { action_type: string; value?: string }) =>
          a.action_type === "purchase" || a.action_type === "omni_purchase"
      );
      if (purchaseAction) {
        conversions = parseInt(purchaseAction.value || "0");
      }
    }

    if (item.action_values) {
      const revenueAction = item.action_values.find(
        (a: { action_type: string; value?: string }) =>
          a.action_type === "purchase" || a.action_type === "omni_purchase"
      );
      if (revenueAction) {
        conversionValue = parseFloat(revenueAction.value || "0");
      }
    }

    // Meta Insights API returns campaign_id, adset_id, ad_id fields at all levels
    const objectId = item[`${level}_id`] || item.id || "";
    const objectName = item[`${level}_name`] || item.name || "";

    const record = {
      ad_account_id: fullAccountId,
      level,
      object_id: objectId,
      object_name: objectName,
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
      date_preset: datePreset,
      fetched_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("ad_insights")
      .upsert(record, {
        onConflict: "object_id,date_start,date_stop,level",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`Error storing ${level} insight:`, error);
    }
  }

  return { count: data.data.length, impressions: totalImpressions, spend: totalSpend };
}

async function notifyAdmins(supabase: any, title: string, message: string) {
  try {
    // Get admin users
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) return;

    // Create notifications for each admin
    for (const role of adminRoles) {
      await supabase.from("notifications").insert({
        user_id: role.user_id,
        title,
        message,
        notification_type: "general",
        link: "/admin/settings",
      });
    }
  } catch (error) {
    console.error("Failed to notify admins:", error);
  }
}

async function logApiError(
  supabase: any,
  functionName: string,
  error: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string },
  requestUrl?: string
) {
  try {
    await supabase.from("meta_api_logs").insert({
      function_name: functionName,
      error_code: error.code,
      error_type: error.type,
      error_message: error.message,
      error_subcode: error.error_subcode,
      fbtrace_id: error.fbtrace_id,
      request_url: requestUrl?.replace(/access_token=[^&]+/, "access_token=[REDACTED]"),
      response_data: error,
    });
  } catch (logError) {
    console.error("Failed to log API error:", logError);
  }
}
