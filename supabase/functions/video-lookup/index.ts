import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get video ID from URL path or query param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const videoId = pathParts[pathParts.length - 1] || url.searchParams.get("videoId");

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Video ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Looking up video: ${videoId}`);

    // Fetch video with creator and performance data
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select(`
        id,
        unique_video_id,
        title,
        description,
        status,
        created_at,
        updated_at,
        thumbnail_url,
        video_url,
        meta_status,
        meta_video_id,
        meta_uploaded_at,
        brand_id,
        brands:brand_id(id, name, logo_url),
        profiles:creator_id(
          id,
          full_name,
          email,
          avatar_url,
          instagram_username,
          commission_percentage
        ),
        performance_data(
          impressions,
          clicks,
          purchases,
          revenue,
          spend,
          recorded_at
        )
      `)
      .eq("unique_video_id", videoId)
      .maybeSingle();

    if (videoError) {
      console.error("Video lookup error:", videoError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch video", details: videoError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!video) {
      return new Response(
        JSON.stringify({ error: `Video not found: ${videoId}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate aggregated performance stats
    const perfData = video.performance_data || [];
    const aggregatedStats = perfData.reduce(
      (acc: any, pd: any) => ({
        impressions: acc.impressions + (pd.impressions || 0),
        clicks: acc.clicks + (pd.clicks || 0),
        purchases: acc.purchases + (pd.purchases || 0),
        revenue: acc.revenue + (pd.revenue || 0),
        spend: acc.spend + (pd.spend || 0),
      }),
      { impressions: 0, clicks: 0, purchases: 0, revenue: 0, spend: 0 }
    );

    // Calculate creator earnings
    const commissionRate = (video.profiles as any)?.commission_percentage || 10;
    const creatorEarnings = aggregatedStats.revenue * (commissionRate / 100);

    // Determine if this is a legacy ID
    const isLegacyId = !/^V\d+-\d+$/.test(videoId);

    const response = {
      video: {
        id: video.id,
        unique_video_id: video.unique_video_id,
        is_legacy_id: isLegacyId,
        title: video.title,
        description: video.description,
        status: video.status,
        created_at: video.created_at,
        updated_at: video.updated_at,
        thumbnail_url: video.thumbnail_url,
        video_url: video.video_url,
        meta_status: video.meta_status,
        meta_video_id: video.meta_video_id,
        meta_uploaded_at: video.meta_uploaded_at,
      },
      creator: video.profiles,
      brand: video.brands,
      performance: {
        summary: {
          ...aggregatedStats,
          creator_earnings: creatorEarnings,
          commission_rate: commissionRate,
          roas: aggregatedStats.spend > 0 
            ? (aggregatedStats.revenue / aggregatedStats.spend).toFixed(2) 
            : null,
        },
        history: perfData.map((pd: any) => ({
          date: pd.recorded_at,
          impressions: pd.impressions,
          clicks: pd.clicks,
          purchases: pd.purchases,
          revenue: pd.revenue,
          spend: pd.spend,
        })),
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Video lookup error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
