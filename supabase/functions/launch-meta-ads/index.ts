import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const RATE_LIMIT_CODE = 80004;
const RATE_LIMIT_COOLDOWN_MS = 300000;

const META_CREATIVE_FEATURES = [
  {
    preferenceKey: "ig_video_native_subtitle",
    legacyPreferenceKey: "video_auto_crop",
    apiKey: "IG_VIDEO_NATIVE_SUBTITLE",
    defaultOn: true,
  },
  {
    preferenceKey: "product_metadata_automation",
    legacyPreferenceKey: "browse_shop",
    apiKey: "PRODUCT_METADATA_AUTOMATION",
    defaultOn: false,
  },
  {
    preferenceKey: "profile_card",
    legacyPreferenceKey: "relevant_comments",
    apiKey: "PROFILE_CARD",
    defaultOn: false,
  },
  {
    preferenceKey: "text_overlay_translation",
    legacyPreferenceKey: "text_improvements",
    apiKey: "TEXT_OVERLAY_TRANSLATION",
    defaultOn: true,
  },
] as const;

function buildCreativeFeaturesSpec(acPrefs: Record<string, unknown>) {
  const spec: Record<string, { enroll_status: "OPT_IN" | "OPT_OUT" }> = {};

  for (const feature of META_CREATIVE_FEATURES) {
    const explicit = acPrefs[feature.preferenceKey];
    const legacy = acPrefs[feature.legacyPreferenceKey];
    const enabled = typeof explicit === "boolean"
      ? explicit
      : typeof legacy === "boolean"
        ? legacy
        : feature.defaultOn;

    spec[feature.apiKey] = {
      enroll_status: enabled ? "OPT_IN" : "OPT_OUT",
    };
  }

  return spec;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getActiveRateLimitCooldown(supabase: ReturnType<typeof createClient>) {
  const cutoff = new Date(Date.now() - RATE_LIMIT_COOLDOWN_MS).toISOString();

  // Only check launch's OWN rate-limit logs — ignore background sync noise
  const { data, error } = await supabase
    .from("meta_api_logs")
    .select("created_at, function_name")
    .eq("error_code", RATE_LIMIT_CODE)
    .eq("function_name", "launch-meta-ads")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.created_at) return null;

  const elapsedMs = Date.now() - new Date(data.created_at).getTime();
  const remainingMs = RATE_LIMIT_COOLDOWN_MS - elapsedMs;
  if (remainingMs <= 0) return null;

  return {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    source: data.function_name,
  };
}

async function logMetaApiRateLimit(
  supabase: ReturnType<typeof createClient>,
  message: string,
  subcode: number | null,
  fbtraceId: string | null,
  requestUrl: string
) {
  try {
    await supabase.from("meta_api_logs").insert({
      function_name: "launch-meta-ads",
      error_code: RATE_LIMIT_CODE,
      error_message: message,
      error_subcode: subcode,
      fbtrace_id: fbtraceId,
      request_url: requestUrl,
    });
  } catch (_) {}
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { launchId } = await req.json();
    if (!launchId) {
      return new Response(JSON.stringify({ error: "launchId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing launch: ${launchId}`);

    await supabase.from("ad_launches").update({ status: "processing" }).eq("id", launchId);

    const { data: launch, error: launchError } = await supabase
      .from("ad_launches").select("*").eq("id", launchId).single();

    if (launchError || !launch) {
      throw new Error(`Launch not found: ${launchError?.message}`);
    }

    const cooldown = await getActiveRateLimitCooldown(supabase);
    if (cooldown) {
      const cooldownMessage = `Meta account is cooling down from recent rate limiting (${cooldown.source}). Wait ~${cooldown.remainingSeconds}s, then retry.`;
      await supabase.from("ad_launches")
        .update({ status: "failed", error_message: cooldownMessage })
        .eq("id", launchId);

      return new Response(
        JSON.stringify({
          error: cooldownMessage,
          code: "RATE_LIMITED_COOLDOWN",
          retry_after_seconds: cooldown.remainingSeconds,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from("ad_launch_items")
      .select("*, videos(id, title, unique_video_id, video_url, thumbnail_url, meta_video_id, creator_id, profiles:creator_id(full_name, instagram_business_account_id))")
      .eq("launch_id", launchId)
      .eq("meta_status", "pending");

    if (itemsError || !items) {
      throw new Error(`Failed to fetch items: ${itemsError?.message}`);
    }

    const { data: credentials } = await supabase
      .from("meta_credentials").select("*").eq("status", "connected").limit(1).single();

    if (!credentials?.access_token || !credentials?.ad_account_id) {
      await supabase.from("ad_launches")
        .update({ status: "failed", error_message: "Meta Ads not connected or credentials incomplete" })
        .eq("id", launchId);
      return new Response(
        JSON.stringify({ error: "Meta credentials not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, ad_account_id, page_id } = credentials;
    const accountId = ad_account_id.replace("act_", "");

    const { data: presets } = await supabase.from("ad_presets").select("*").limit(1).single();

    const campaignConfig = launch.campaign_config as any;
    const adSetConfig = launch.ad_set_config as any;
    const adPrefs = launch.ad_preferences as any;

    // Resolve campaign ID: existing or new
    let campaignId: string | null = null;
    if (campaignConfig?.mode === "existing" && campaignConfig?.campaign_id) {
      campaignId = campaignConfig.campaign_id;
      console.log(`Using existing campaign: ${campaignId}`);
    } else if (campaignConfig?.mode === "new" && campaignConfig?.name) {
      try {
        const campaignRes = await metaPost(`act_${accountId}/campaigns`, access_token, {
          name: campaignConfig.name,
          objective: campaignConfig.objective || "OUTCOME_SALES",
          status: "PAUSED",
          special_ad_categories: "[]",
        }, supabase);
        campaignId = campaignRes.id;
        console.log(`Created campaign: ${campaignId}`);
      } catch (e) {
        console.error("Failed to create campaign:", e);
        await supabase.from("ad_launches")
          .update({ status: "failed", error_message: `Campaign creation failed: ${e.message}` })
          .eq("id", launchId);
        return new Response(
          JSON.stringify({ error: `Campaign creation failed: ${e.message}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Resolve ad set ID: existing or new
    let adSetId: string | null = null;
    if (adSetConfig?.mode === "existing" && adSetConfig?.ad_set_id) {
      adSetId = adSetConfig.ad_set_id;
      console.log(`Using existing ad set: ${adSetId}`);
    } else if (adSetConfig?.mode === "new" && adSetConfig?.name && campaignId) {
      try {
        const adSetParams: Record<string, string> = {
          name: adSetConfig.name,
          campaign_id: campaignId,
          billing_event: "IMPRESSIONS",
          optimization_goal: "OFFSITE_CONVERSIONS",
          daily_budget: adSetConfig.daily_budget || campaignConfig?.daily_budget?.toString() || "5000",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          status: "PAUSED",
          multi_advertiser_optimization: adSetConfig.multi_advertiser === false ? "NONE" : "EACH_ADVERTISER",
        };

        // Build targeting with placements
        const targeting: any = { geo_locations: { countries: ["US"] } };
        const placementConfig = adSetConfig.placement;

        if (placementConfig?.mode === "manual" && placementConfig?.platforms) {
          const platforms = placementConfig.platforms;
          const publisherPlatforms: string[] = [];
          const facebookPositions: string[] = [];
          const instagramPositions: string[] = [];
          const messengerPositions: string[] = [];

          if (platforms.facebook?.length > 0) {
            publisherPlatforms.push("facebook");
            facebookPositions.push(...platforms.facebook);
          }
          if (platforms.instagram?.length > 0) {
            publisherPlatforms.push("instagram");
            instagramPositions.push(...platforms.instagram);
          }
          if (platforms.messenger?.length > 0) {
            publisherPlatforms.push("messenger");
            messengerPositions.push(...platforms.messenger);
          }
          if (platforms.audience_network?.length > 0) {
            publisherPlatforms.push("audience_network");
          }

          if (publisherPlatforms.length > 0) targeting.publisher_platforms = publisherPlatforms;
          if (facebookPositions.length > 0) targeting.facebook_positions = facebookPositions;
          if (instagramPositions.length > 0) targeting.instagram_positions = instagramPositions;
          if (messengerPositions.length > 0) targeting.messenger_positions = messengerPositions;
        }

        adSetParams.targeting = JSON.stringify(targeting);

        const adSetRes = await metaPost(`act_${accountId}/adsets`, access_token, adSetParams, supabase);
        adSetId = adSetRes.id;
        console.log(`Created ad set: ${adSetId}`);
      } catch (e) {
        console.error("Failed to create ad set:", e);
      }
    }

    // Process each item
    let adsCreated = 0;
    let adsFailed = 0;

    let rateLimitBreaker = false;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];

      // Inter-item pacing (skip before first item)
      if (idx > 0) await sleep(2000);

      // Circuit breaker: skip remaining if we hit a persistent rate limit
      if (rateLimitBreaker) {
        await supabase.from("ad_launch_items").update({
          meta_status: "rate_limited",
          error_message: "Skipped — account rate-limited. Retry shortly.",
        }).eq("id", item.id);
        adsFailed++;
        continue;
      }

      try {
        const video = (item as any).videos;
        if (!video) throw new Error("Video not found for item");

        const metaVideoId = video.meta_video_id;
        if (!metaVideoId) throw new Error(`Video ${video.unique_video_id} has not been uploaded to Meta yet`);

        // Resolve thumbnail: local DB first, then Graph API fallback
        let thumbnailUrl = video.thumbnail_url || "";
        if (!thumbnailUrl) {
          try {
            console.log(`No local thumbnail for ${video.unique_video_id}, fetching from Graph...`);
            const thumbRes = await fetch(
              `https://graph.facebook.com/${META_API_VERSION}/${metaVideoId}?fields=thumbnails{uri}&access_token=${access_token}`
            );
            const thumbData = await thumbRes.json();
            const thumbUri = thumbData?.thumbnails?.data?.[0]?.uri;
            if (thumbUri) {
              thumbnailUrl = thumbUri;
              console.log(`Graph thumbnail resolved for ${video.unique_video_id}`);
            }
          } catch (e) {
            console.error(`Graph thumbnail fetch failed for ${video.unique_video_id}:`, e);
          }
        }
        if (!thumbnailUrl) {
          throw new Error(`Missing thumbnail for ${video.unique_video_id}. Add/regenerate thumbnail before launch.`);
        }

        let finalUrl = item.landing_url || credentials.default_link || "";
        if (finalUrl && presets) finalUrl = appendUtms(finalUrl, presets);

        const creatorProfile = video.profiles;
        const igBusinessAccountId = creatorProfile?.instagram_business_account_id;
        const usePartnership = item.identity_type === "partnership" && igBusinessAccountId;

        // Build degrees_of_freedom_spec from supported individual creative feature preferences.
        // Meta deprecated legacy blanket/legacy keys (e.g. standard_enhancements, music, 3d_animation).
        const acPrefs = (adPrefs?.advantage_creative || {}) as Record<string, unknown>;
        const creativeFeaturesSpec = buildCreativeFeaturesSpec(acPrefs);
        console.log("Creative feature spec", creativeFeaturesSpec);

        const creativePayload: Record<string, string> = {
          name: `Creative - ${item.ad_name || video.title}`,
          degrees_of_freedom_spec: JSON.stringify({
            creative_features_spec: creativeFeaturesSpec,
          }),
          object_story_spec: JSON.stringify({
            page_id: page_id,
            video_data: {
              video_id: metaVideoId,
              image_url: thumbnailUrl,
              message: item.primary_text || "",
              title: item.headline || "",
              call_to_action: {
                type: item.cta || "SHOP_NOW",
                value: { link: finalUrl },
              },
              ...(usePartnership ? { branded_content_sponsor_id: igBusinessAccountId } : {}),
            },
          }),
        };

        const creative = await metaPost(`act_${accountId}/adcreatives`, access_token, creativePayload, supabase);
        console.log(`Created creative: ${creative.id} for ${video.unique_video_id}`);

        // Use item-level IDs first, then launch-level IDs
        const itemCampaignId = item.campaign_id || campaignId;
        const itemAdSetId = item.ad_set_id || adSetId;

        if (!itemAdSetId) {
          throw new Error("No ad set ID available — select an existing ad set or create a new one");
        }

        const adPayload: Record<string, string> = {
          name: item.ad_name || video.title,
          adset_id: itemAdSetId,
          creative: JSON.stringify({ creative_id: creative.id }),
          status: adPrefs?.launch_status === "active" ? "ACTIVE" : "PAUSED",
        };

        const ad = await metaPost(`act_${accountId}/ads`, access_token, adPayload, supabase);
        console.log(`Created ad: ${ad.id}`);

        await supabase.from("ad_launch_items").update({
          meta_ad_id: ad.id,
          meta_status: "active",
          campaign_id: itemCampaignId,
          ad_set_id: itemAdSetId,
        }).eq("id", item.id);

        adsCreated++;
      } catch (e: any) {
        console.error(`Failed to create ad for item ${item.id}:`, e);

        // Check if this is a rate-limit error — activate circuit breaker
        if (e.metaCode === RATE_LIMIT_CODE) {
          rateLimitBreaker = true;
        }

        await supabase.from("ad_launch_items").update({
          meta_status: e.metaCode === RATE_LIMIT_CODE ? "rate_limited" : "error",
          error_message: e.message || "Unknown error",
        }).eq("id", item.id);
        adsFailed++;
      }

      await supabase.from("ad_launches").update({ ads_created: adsCreated }).eq("id", launchId);
    }

    const finalStatus = adsFailed === items.length ? "failed" : adsCreated > 0 ? "completed" : "failed";
    await supabase.from("ad_launches").update({
      status: finalStatus,
      ads_created: adsCreated,
      completed_at: new Date().toISOString(),
      error_message: adsFailed > 0 ? `${adsFailed} of ${items.length} ads failed` : null,
    }).eq("id", launchId);

    console.log(`Launch ${launchId} complete: ${adsCreated} created, ${adsFailed} failed`);

    // Notify all admins via email about the launch result
    try {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles?.length) {
        const subject = finalStatus === "completed"
          ? `✅ Ad Launch Complete — ${adsCreated}/${items.length} ads live`
          : `⚠️ Ad Launch Issue — ${adsCreated} created, ${adsFailed} failed`;
        const message = finalStatus === "completed"
          ? `All ${adsCreated} ads have been successfully launched on Meta and are now ${(launch.ad_preferences as any)?.launch_status === "active" ? "ACTIVE" : "PAUSED"}.`
          : `Ad launch finished with issues: ${adsCreated} ads created successfully, ${adsFailed} failed. Check the Ads Builder for details.`;

        for (const admin of adminRoles) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                user_id: admin.user_id,
                title: subject,
                message,
                notification_type: "general",
                link: "/ads/builder",
              }),
            });
          } catch (emailErr) {
            console.error(`Failed to notify admin ${admin.user_id}:`, emailErr);
          }
        }
        console.log(`Notified ${adminRoles.length} admin(s) about launch result`);
      }
    } catch (notifyErr) {
      console.error("Error notifying admins:", notifyErr);
    }

    return new Response(
      JSON.stringify({ success: true, adsCreated, adsFailed, status: finalStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in launch-meta-ads:", error);
    try {
      const { launchId } = await req.clone().json();
      if (launchId) {
        await supabase.from("ad_launches")
          .update({ status: "failed", error_message: error.message })
          .eq("id", launchId);
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function metaPost(
  endpoint: string,
  accessToken: string,
  params: Record<string, string>,
  supabase: ReturnType<typeof createClient>,
  maxRetries = 3
): Promise<any> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${endpoint}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const body = new URLSearchParams({ ...params, access_token: accessToken });
    const response = await fetch(url, { method: "POST", body });
    const data = await response.json();

    if (!data.error) return data;

    console.error(`Meta API error (attempt ${attempt + 1}):`, JSON.stringify(data.error, null, 2));

    // Rate limit: retry with exponential backoff
    if (data.error.code === RATE_LIMIT_CODE && attempt < maxRetries) {
      const backoffMs = 3000 * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`Rate limited, backing off ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
      continue;
    }

    if (data.error.code === RATE_LIMIT_CODE) {
      await logMetaApiRateLimit(
        supabase,
        data.error.message || "Rate limited",
        data.error.error_subcode ?? null,
        data.error.fbtrace_id ?? null,
        url
      );
    }

    // Terminal failure
    const userMsg = data.error.error_user_msg ? ` — ${data.error.error_user_msg}` : "";
    const err: any = new Error(`Meta API error: ${data.error.message}${userMsg} (code: ${data.error.code}, subcode: ${data.error.error_subcode || "none"})`);
    err.metaCode = data.error.code;
    throw err;
  }
}

function appendUtms(url: string, presets: any): string {
  try {
    const u = new URL(url);
    if (presets.utm_source) u.searchParams.set("utm_source", presets.utm_source);
    if (presets.utm_medium) u.searchParams.set("utm_medium", presets.utm_medium);
    if (presets.utm_campaign) u.searchParams.set("utm_campaign", presets.utm_campaign);
    if (presets.utm_content) u.searchParams.set("utm_content", presets.utm_content);
    if (presets.utm_term) u.searchParams.set("utm_term", presets.utm_term);
    return u.toString();
  } catch {
    return url;
  }
}
