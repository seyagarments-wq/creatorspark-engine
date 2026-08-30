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
};

// Cooldown: skip sync if last rate-limit was within this window
const RATE_LIMIT_COOLDOWN_MS = 300_000; // 5 minutes

async function logApiError(supabase: any, functionName: string, error: any, requestUrl?: string) {
  try {
    await supabase.from("meta_api_logs").insert({
      function_name: functionName,
      error_code: error?.code,
      error_type: error?.type,
      error_message: error?.message,
      error_subcode: error?.error_subcode,
      fbtrace_id: error?.fbtrace_id,
      request_url: requestUrl?.replace(/access_token=[^&]+/, "access_token=[REDACTED]"),
      response_data: error,
    });
  } catch (logError) {
    console.error("Failed to log API error:", logError);
  }
}

type Metrics = {
  impressions: number;
  clicks: number;
  spend: number;
  purchases: number;
  revenue: number;
};

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting Meta performance sync...");

    // ---- Yield guard: skip if a launch is active OR was recently attempted ----
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentLaunch } = await supabase
      .from("ad_launches")
      .select("id, status, created_at")
      .gte("created_at", tenMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentLaunch) {
      console.log(`Recent launch detected (${recentLaunch.id}, status=${recentLaunch.status}), yielding to preserve API budget`);
      return new Response(
        JSON.stringify({ message: "Yielding to recent ad launch", synced: 0, error_code: "YIELD_TO_LAUNCH" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Cooldown guard: check if we were rate-limited recently ----
    const { data: recentRateLimit } = await supabase
      .from("meta_api_logs")
      .select("created_at")
      .eq("function_name", "meta-sync-performance")
      .eq("error_code", META_ERROR_CODES.RATE_LIMIT)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentRateLimit) {
      const lastRateLimitAt = new Date(recentRateLimit.created_at).getTime();
      const elapsed = Date.now() - lastRateLimitAt;
      if (elapsed < RATE_LIMIT_COOLDOWN_MS) {
        const waitSec = Math.ceil((RATE_LIMIT_COOLDOWN_MS - elapsed) / 1000);
        console.log(`Cooldown active — rate-limited ${Math.round(elapsed / 1000)}s ago, waiting ${waitSec}s more`);
        return new Response(
          JSON.stringify({ message: `Rate-limit cooldown active (${waitSec}s remaining)`, synced: 0, error_code: "COOLDOWN" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch Meta credentials
    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      console.log("No Meta credentials found, skipping sync");
      return new Response(
        JSON.stringify({ message: "Meta Ads not connected", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id, expires_at } = credentials;
    
    if (!access_token || !ad_account_id) {
      console.log("Missing access token or ad account ID");
      return new Response(
        JSON.stringify({ message: "Meta credentials incomplete", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (expires_at && new Date(expires_at) < new Date()) {
      console.log("Access token has expired");
      await supabase.from("meta_credentials").update({ status: "expired" }).eq("id", credentials.id);
      return new Response(
        JSON.stringify({ message: "Access token expired", synced: 0, error_code: "TOKEN_EXPIRED" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountId = ad_account_id.replace("act_", "");

    const { data: allVideosFromDb } = await supabase
      .from("videos")
      .select(`
        id, 
        meta_video_id, 
        creator_id, 
        unique_video_id,
        created_at,
        commission_override,
        profiles!videos_creator_id_fkey(id, commission_percentage)
      `)
      .eq("status", "approved");

    if (!allVideosFromDb || allVideosFromDb.length === 0) {
      console.log("No approved videos to sync");
      return new Response(
        JSON.stringify({ message: "No approved videos to sync", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vidByUniqueId = new Map(allVideosFromDb.filter(v => v.unique_video_id).map(v => [v.unique_video_id, v]));
    const vidByMetaVideoId = new Map(allVideosFromDb.filter(v => v.meta_video_id).map(v => [v.meta_video_id, v]));
    
    const platformVideos = allVideosFromDb;
    console.log(`Syncing: ${platformVideos.length} approved videos (${vidByMetaVideoId.size} with meta_video_id)`);

    const { data: commissionSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "commission")
      .single();

    const defaultCommission = commissionSetting?.value?.default || 10;

    // Fetch ALL ads with exponential backoff on rate limit
    let allAds: any[] = [];
    let adsUrl: string | null = `https://graph.facebook.com/v21.0/act_${accountId}/ads?fields=id,name,status,creative{id,video_id,thumbnail_url,object_story_spec}&limit=100&access_token=${access_token}`;
    let rateLimited = false;
    
    try {
      let retryCount = 0;
      const MAX_RETRIES = 2;

      while (adsUrl) {
        const adsResponse = await fetch(adsUrl);
        const adsData = await adsResponse.json();
        
        if (adsData.error) {
          if (adsData.error.code === META_ERROR_CODES.RATE_LIMIT) {
            if (retryCount < MAX_RETRIES) {
              const backoffMs = Math.min(5000 * Math.pow(2, retryCount) + Math.random() * 2000, 30000);
              console.log(`Rate limited, backoff ${Math.round(backoffMs / 1000)}s (attempt ${retryCount + 1}/${MAX_RETRIES})`);
              await new Promise(r => setTimeout(r, backoffMs));
              retryCount++;
              continue; // retry same URL
            }
            console.error("Rate limit exhausted after retries");
            await logApiError(supabase, "meta-sync-performance", adsData.error, adsUrl);
            rateLimited = true;
            break;
          }

          console.error("Error fetching ads:", adsData.error);
          await logApiError(supabase, "meta-sync-performance", adsData.error, adsUrl);
          
          if (adsData.error.code === META_ERROR_CODES.EXPIRED_TOKEN) {
            await supabase.from("meta_credentials").update({ status: "expired" }).eq("id", credentials.id);
            return new Response(
              JSON.stringify({ message: "Access token expired", synced: 0, error_code: "TOKEN_EXPIRED" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          break;
        }
        
        retryCount = 0; // reset on success
        if (adsData.data) {
          allAds = [...allAds, ...adsData.data];
        }
        adsUrl = adsData.paging?.next || null;
      }
      console.log(`Fetched ${allAds.length} ads from Meta account`);
    } catch (error) {
      console.error("Failed to fetch ads list:", error);
      await logApiError(supabase, "meta-sync-performance", { message: error instanceof Error ? error.message : "Unknown error", type: "FetchError", code: 0 });
    }

    // If rate-limited and we got zero ads, return early with structured response
    if (rateLimited && allAds.length === 0) {
      return new Response(
        JSON.stringify({ message: "Rate limited — will retry next cycle", synced: 0, error_code: "RATE_LIMITED" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adMap = new Map(allAds.map(ad => [ad.id, ad]));

    let syncedCount = 0;
    let errorCount = 0;
    let totalSyncedImpressions = 0;
    let totalSyncedRevenue = 0;

    function parseInsights(insight: any): Metrics {
      const result = { impressions: 0, clicks: 0, spend: 0, purchases: 0, revenue: 0 };
      result.impressions = parseInt(insight.impressions || "0");
      result.clicks = parseInt(insight.clicks || "0");
      result.spend = parseFloat(insight.spend || "0");

      if (insight.actions) {
        const purchaseAction = insight.actions.find(
          (a: { action_type: string; value?: string }) => 
            a.action_type === "purchase" || a.action_type === "omni_purchase"
        );
        if (purchaseAction) result.purchases = parseInt(purchaseAction.value || "0");
      }

      if (insight.action_values) {
        const revenueAction = insight.action_values.find(
          (a: { action_type: string; value?: string }) => 
            a.action_type === "purchase" || a.action_type === "omni_purchase"
        );
        if (revenueAction) result.revenue = parseFloat(revenueAction.value || "0");
      }
      
      return result;
    }

    async function fetchAdInsightsDaily(
      adId: string, since: string, until: string
    ): Promise<Array<{ metric_date: string; metrics: Metrics }>> {
      const rows: Array<{ metric_date: string; metrics: Metrics }> = [];
      const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
      const attrWindows = encodeURIComponent(JSON.stringify(["1d_click"]));
      let nextUrl: string | null =
        `https://graph.facebook.com/v21.0/${adId}/insights` +
        `?fields=impressions,clicks,spend,actions,action_values,date_start,date_stop` +
        `&time_increment=1&time_range=${timeRange}&action_attribution_windows=${attrWindows}` +
        `&limit=500&access_token=${access_token}`;

      let retryCount = 0;
      while (nextUrl) {
        const resp = await fetch(nextUrl);
        const json = await resp.json();

        if (json?.error) {
          if (json.error.code === META_ERROR_CODES.RATE_LIMIT && retryCount < 2) {
            const backoffMs = 5000 * Math.pow(2, retryCount) + Math.random() * 2000;
            console.log(`Insight rate limited for ${adId}, backoff ${Math.round(backoffMs / 1000)}s`);
            await new Promise(r => setTimeout(r, backoffMs));
            retryCount++;
            continue;
          }
          console.error(`Meta API error for ad ${adId}:`, json.error);
          await logApiError(supabase, "meta-sync-performance", json.error, nextUrl);
          break;
        }

        retryCount = 0;
        if (Array.isArray(json?.data)) {
          for (const item of json.data) {
            const metricDate = item?.date_start as string | undefined;
            if (!metricDate) continue;
            rows.push({ metric_date: metricDate, metrics: parseInsights(item) });
          }
        }
        nextUrl = json?.paging?.next || null;
      }
      return rows;
    }

    async function savePerformanceData(
      videoId: string, creatorId: string, videoTitle: string, metricDate: string,
      metrics: Metrics, commissionRate: number
    ) {
      const today = isoDate(new Date());
      const hasAnyActivity = metrics.impressions > 0 || metrics.clicks > 0 || metrics.spend > 0 || metrics.purchases > 0 || metrics.revenue > 0;
      if (!hasAnyActivity) return;

      let newSales = 0;
      let existingCommissionRate: number | null = null;
      
      const { data: existingRecord } = await supabase
        .from("performance_data")
        .select("id, purchases, commission_rate_at_time")
        .eq("video_id", videoId)
        .eq("metric_date", metricDate)
        .maybeSingle();

      if (metricDate === today) {
        const previousPurchases = existingRecord?.purchases || 0;
        newSales = metrics.purchases - previousPurchases;
      }
      
      existingCommissionRate = existingRecord?.commission_rate_at_time;
      const rateToStore = existingCommissionRate ?? commissionRate;

      const { error: upsertError } = await supabase
        .from("performance_data")
        .upsert({
          video_id: videoId, metric_date: metricDate,
          impressions: metrics.impressions, clicks: metrics.clicks,
          spend: metrics.spend, purchases: metrics.purchases,
          revenue: metrics.revenue, commission_rate_at_time: rateToStore,
          recorded_at: new Date().toISOString(),
        }, { onConflict: "video_id,metric_date" });

      if (upsertError) {
        console.error(`Failed to upsert performance data for ${videoId} (${metricDate}):`, upsertError.message);
        return;
      }

      if (newSales > 0) {
        console.log(`New sale for ${videoTitle} (${metricDate}): ${newSales} sales, $${metrics.revenue.toFixed(2)} revenue`);
        const { data: profile } = await supabase.from("profiles").select("user_id, full_name").eq("id", creatorId).single();
        if (profile?.user_id) {
          const earnings = metrics.revenue * (commissionRate / 100);
          const saleText = newSales === 1 ? "sale" : "sales";
          await supabase.from("notifications").insert({
            user_id: profile.user_id,
            title: `💰 New ${saleText}!`,
            message: `Your video "${videoTitle}" just got ${newSales} ${saleText}! You earned $${earnings.toFixed(2)} in commission.`,
            notification_type: "sale",
            link: "/creator/analytics",
          });
        }
      }
    }

    // Process all ads — match to videos by meta_video_id OR V-ID in ad name
    const processedAdIds = new Set<string>();
    const videoTotalsByDate = new Map<string, Map<string, Metrics>>();

    const now = new Date();
    const since = isoDate(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
    const until = isoDate(now);
    console.log(`Sync window: ${since} -> ${until} (daily)`);

    const vidPattern = /\bV(\d+)-(\d+)\b/g;

    for (const ad of allAds) {
      let matchedVideo: any = null;

      const creative = ad.creative;
      const videoData = creative?.object_story_spec?.video_data;
      if (videoData?.video_id && vidByMetaVideoId.has(videoData.video_id)) {
        matchedVideo = vidByMetaVideoId.get(videoData.video_id);
      }

      if (!matchedVideo && ad.name) {
        const matches = [...ad.name.matchAll(vidPattern)];
        for (const match of matches) {
          const vid = match[0];
          if (vidByUniqueId.has(vid)) {
            matchedVideo = vidByUniqueId.get(vid);
            break;
          }
        }
      }

      if (!matchedVideo) continue;
      processedAdIds.add(ad.id);

      const daily = await fetchAdInsightsDaily(ad.id, since, until);
      
      if (!videoTotalsByDate.has(matchedVideo.id)) {
        videoTotalsByDate.set(matchedVideo.id, new Map());
      }
      const totalsByDate = videoTotalsByDate.get(matchedVideo.id)!;

      const videoCreatedDate = matchedVideo.created_at 
        ? isoDate(new Date(matchedVideo.created_at)) 
        : since;

      for (const row of daily) {
        if (row.metric_date < videoCreatedDate) continue;
        const existing = totalsByDate.get(row.metric_date) || { impressions: 0, clicks: 0, spend: 0, purchases: 0, revenue: 0 };
        totalsByDate.set(row.metric_date, {
          impressions: existing.impressions + row.metrics.impressions,
          clicks: existing.clicks + row.metrics.clicks,
          spend: existing.spend + row.metrics.spend,
          purchases: existing.purchases + row.metrics.purchases,
          revenue: existing.revenue + row.metrics.revenue,
        });
      }
    }

    console.log(`Matched ${processedAdIds.size} ads to ${videoTotalsByDate.size} videos`);

    for (const video of platformVideos) {
      const totalsByDate = videoTotalsByDate.get(video.id);
      if (!totalsByDate || totalsByDate.size === 0) continue;

      try {
        const totalImpressionsYtd = Array.from(totalsByDate.values()).reduce((sum, m) => sum + m.impressions, 0);
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysAgoStr = isoDate(twoDaysAgo);
        const recentImpressions = Array.from(totalsByDate.entries())
          .filter(([date]) => date >= twoDaysAgoStr)
          .reduce((sum, [, m]) => sum + m.impressions, 0);

        if (totalImpressionsYtd > 0) {
          const newStatus = recentImpressions > 0 ? "live" : "paused";
          await supabase.from("videos").update({ meta_status: newStatus }).eq("id", video.id);
        }

        const profilesData = video.profiles as unknown as { id: string; commission_percentage: number } | { id: string; commission_percentage: number }[] | null;
        const creatorProfile = Array.isArray(profilesData) ? profilesData[0] : profilesData;
        const commissionRate = video.commission_override ?? creatorProfile?.commission_percentage ?? defaultCommission;

        for (const [metricDate, metrics] of totalsByDate.entries()) {
          await savePerformanceData(video.id, video.creator_id, video.unique_video_id || "Unknown Video", metricDate, metrics, commissionRate);
        }

        const totalRevenueYtd = Array.from(totalsByDate.values()).reduce((sum, m) => sum + m.revenue, 0);
        const creatorEarnings = totalRevenueYtd * (commissionRate / 100);

        console.log(`Video ${video.unique_video_id}: ${totalImpressionsYtd} imp YTD, $${totalRevenueYtd.toFixed(2)} rev, $${creatorEarnings.toFixed(2)} earnings (${commissionRate}%)`);

        totalSyncedImpressions += totalImpressionsYtd;
        totalSyncedRevenue += totalRevenueYtd;
        syncedCount++;
      } catch (videoError) {
        console.error(`Error syncing video ${video.unique_video_id}:`, videoError);
        errorCount++;
      }
    }

    // Update last sync time
    await supabase.from("meta_credentials").update({ updated_at: new Date().toISOString() }).eq("id", credentials.id);

    const duration = Date.now() - startTime;
    console.log(`Sync complete in ${duration}ms: ${syncedCount} synced, ${errorCount} errors, ${totalSyncedImpressions} imp, $${totalSyncedRevenue.toFixed(2)} rev`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        errors: errorCount,
        total: platformVideos.length,
        duration_ms: duration,
        total_impressions: totalSyncedImpressions,
        total_revenue: totalSyncedRevenue,
        rate_limited: rateLimited,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in meta-sync-performance:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
