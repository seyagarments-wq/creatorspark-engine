import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/secrets.ts";
import { aiChatCompletion } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = (await getSecret("LOVABLE_API_KEY"))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Generating weekly performance digest...");

    // Calculate week boundaries
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekStartStr = weekStart.toISOString();
    const weekEndStr = weekEnd.toISOString();
    const weekStartDate = weekStart.toISOString().split('T')[0];
    const weekEndDate = weekEnd.toISOString().split('T')[0];

    console.log(`Analyzing period: ${weekStartDate} to ${weekEndDate}`);

    // Fetch performance data for the week - using metric_date column for accuracy
    const { data: performanceData, error: perfError } = await supabase
      .from("performance_data")
      .select(`
        *,
        videos(id, title, unique_video_id, creator_id, hook_score, profiles:creator_id(full_name, commission_percentage))
      `)
      .gte("metric_date", weekStartDate)
      .lte("metric_date", weekEndDate);

    if (perfError) {
      console.error("Error fetching performance data:", perfError);
      throw perfError;
    }

    console.log(`Found ${performanceData?.length || 0} performance records`);

    // Aggregate by video
    const videoStats = new Map<string, {
      id: string;
      title: string;
      unique_video_id: string;
      creator_name: string;
      hook_score: number | null;
      impressions: number;
      clicks: number;
      purchases: number;
      revenue: number;
      spend: number;
    }>();

    for (const perf of performanceData || []) {
      const video = perf.videos as any;
      if (!video) continue;

      const existing = videoStats.get(video.id) || {
        id: video.id,
        title: video.title,
        unique_video_id: video.unique_video_id,
        creator_name: video.profiles?.full_name || "Unknown",
        hook_score: video.hook_score,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        revenue: 0,
        spend: 0,
      };

      existing.impressions += perf.impressions || 0;
      existing.clicks += perf.clicks || 0;
      existing.purchases += perf.purchases || 0;
      existing.revenue += parseFloat(perf.revenue) || 0;
      existing.spend += parseFloat(perf.spend) || 0;

      videoStats.set(video.id, existing);
    }

    const allVideos = Array.from(videoStats.values());
    
    // Calculate totals
    const totalImpressions = allVideos.reduce((sum, v) => sum + v.impressions, 0);
    const totalClicks = allVideos.reduce((sum, v) => sum + v.clicks, 0);
    const totalPurchases = allVideos.reduce((sum, v) => sum + v.purchases, 0);
    const totalRevenue = allVideos.reduce((sum, v) => sum + v.revenue, 0);
    const totalSpend = allVideos.reduce((sum, v) => sum + v.spend, 0);
    const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;

    // Find top performers
    const topByROAS = [...allVideos]
      .filter(v => v.spend > 0)
      .sort((a, b) => (b.revenue / b.spend) - (a.revenue / a.spend))
      .slice(0, 5);

    const topByRevenue = [...allVideos]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const topBySales = [...allVideos]
      .sort((a, b) => b.purchases - a.purchases)
      .slice(0, 5);

    // Find underperformers (high spend, low ROAS)
    const underperformers = [...allVideos]
      .filter(v => v.spend > 50 && (v.spend > 0 ? v.revenue / v.spend : 0) < 1)
      .sort((a, b) => a.revenue / a.spend - b.revenue / b.spend)
      .slice(0, 5);

    // Get previous week for comparison
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

    const { data: prevPerfData } = await supabase
      .from("performance_data")
      .select("impressions, clicks, purchases, revenue, spend")
      .gte("metric_date", prevWeekStart.toISOString().split('T')[0])
      .lte("metric_date", prevWeekEnd.toISOString().split('T')[0]);

    const prevTotals = (prevPerfData || []).reduce((acc, p) => ({
      impressions: acc.impressions + (p.impressions || 0),
      clicks: acc.clicks + (p.clicks || 0),
      purchases: acc.purchases + (p.purchases || 0),
      revenue: acc.revenue + (parseFloat(p.revenue) || 0),
      spend: acc.spend + (parseFloat(p.spend) || 0),
    }), { impressions: 0, clicks: 0, purchases: 0, revenue: 0, spend: 0 });

    // Calculate week-over-week changes
    const revenueChange = prevTotals.revenue > 0 
      ? ((totalRevenue - prevTotals.revenue) / prevTotals.revenue * 100) 
      : 0;
    const salesChange = prevTotals.purchases > 0 
      ? ((totalPurchases - prevTotals.purchases) / prevTotals.purchases * 100) 
      : 0;
    const prevROAS = prevTotals.spend > 0 ? prevTotals.revenue / prevTotals.spend : 0;
    const roasChange = prevROAS > 0 
      ? ((overallROAS - prevROAS) / prevROAS * 100) 
      : 0;

    // Default AI insights (will be enhanced with AI if data exists)
    let aiInsights = {
      headline: allVideos.length > 0 
        ? `Week of ${weekStartDate}: $${totalRevenue.toFixed(0)} revenue, ${totalPurchases} sales`
        : `Week of ${weekStartDate}: No performance data yet`,
      key_insights: allVideos.length > 0 ? [
        `Overall ROAS: ${overallROAS.toFixed(2)}x`,
        `${allVideos.length} videos generated performance data`,
        revenueChange >= 0 ? `Revenue up ${revenueChange.toFixed(1)}% from last week` : `Revenue down ${Math.abs(revenueChange).toFixed(1)}% from last week`
      ] : [
        "No videos have performance data yet",
        "Export videos to Meta to start tracking performance",
        "Performance will sync automatically once ads are running"
      ],
      recommendations: allVideos.length > 0 ? [
        underperformers.length > 0 ? `Review ${underperformers.length} underperforming videos` : "All videos performing well",
        "Focus on top ROAS content patterns"
      ] : [
        "Export approved videos to Meta Ads",
        "Connect your Meta Ad Account in Settings"
      ],
      sentiment: allVideos.length === 0 ? "neutral" : (overallROAS >= 2 ? "positive" : overallROAS >= 1 ? "neutral" : "negative") as "positive" | "neutral" | "negative"
    };

    // Use AI to generate insights if we have data
    if (allVideos.length > 0) {
      try {
        const dataQualityNote = allVideos.length < 5 
          ? `\n\nIMPORTANT: This analysis is based on only ${allVideos.length} video(s) with performance data. Be cautious about generalizations and explicitly note the limited sample size in your insights.`
          : "";

        const aiPrompt = `You are a Meta Ads performance analyst. Generate a brief weekly digest summary based on this data:

DATA SCOPE: ${allVideos.length} videos with performance data over a 7-day window.${dataQualityNote}

Week: ${weekStartDate} to ${weekEndDate}

Totals:
- Revenue: $${totalRevenue.toFixed(2)} (${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}% WoW)
- Sales: ${totalPurchases} (${salesChange >= 0 ? '+' : ''}${salesChange.toFixed(1)}% WoW)
- ROAS: ${overallROAS.toFixed(2)}x
- Impressions: ${totalImpressions.toLocaleString()}
- CTR: ${overallCTR.toFixed(2)}%

Top Video by ROAS: ${topByROAS[0]?.title || 'N/A'} (${topByROAS[0] ? ((topByROAS[0].revenue / topByROAS[0].spend)).toFixed(2) + 'x' : 'N/A'})
Top Video by Revenue: ${topByRevenue[0]?.title || 'N/A'} ($${topByRevenue[0]?.revenue.toFixed(2) || 0})
Videos Underperforming: ${underperformers.length}

Provide a concise JSON response:
{
  "headline": "<one-line summary of the week>",
  "key_insights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "recommendations": ["<action 1>", "<action 2>"],
  "sentiment": "positive" | "neutral" | "negative"
}`;

        const aiResponse = await aiChatCompletion({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a Meta Ads analyst. Respond with valid JSON only." },
              { role: "user", content: aiPrompt }
            ],
            temperature: 0.3,
          });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiContent = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiInsights = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (aiError) {
        console.log("AI insights generation failed, using default:", aiError);
      }
    }

    // Build the digest
    const digestData = {
      summary: {
        total_revenue: totalRevenue,
        total_spend: totalSpend,
        total_purchases: totalPurchases,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        overall_roas: overallROAS,
        overall_ctr: overallCTR,
        active_videos: allVideos.length,
      },
      week_over_week: {
        revenue_change: revenueChange,
        sales_change: salesChange,
        roas_change: roasChange,
      },
      top_performers: {
        by_roas: topByROAS.map(v => ({
          id: v.id,
          title: v.title,
          creator: v.creator_name,
          roas: v.spend > 0 ? v.revenue / v.spend : 0,
          revenue: v.revenue,
        })),
        by_revenue: topByRevenue.map(v => ({
          id: v.id,
          title: v.title,
          creator: v.creator_name,
          revenue: v.revenue,
          purchases: v.purchases,
        })),
        by_sales: topBySales.map(v => ({
          id: v.id,
          title: v.title,
          creator: v.creator_name,
          purchases: v.purchases,
        })),
      },
      underperformers: underperformers.map(v => ({
        id: v.id,
        title: v.title,
        creator: v.creator_name,
        roas: v.spend > 0 ? v.revenue / v.spend : 0,
        spend: v.spend,
      })),
      ai_insights: aiInsights,
    };

    // Save the digest
    const { error: saveError } = await supabase
      .from("performance_digests")
      .upsert({
        week_start: weekStartDate,
        week_end: weekEndDate,
        digest_data: digestData,
        created_at: new Date().toISOString(),
      }, { onConflict: "week_start" });

    if (saveError) {
      console.error("Error saving digest:", saveError);
      throw saveError;
    }

    console.log("Performance digest generated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        digest: digestData,
        period: { start: weekStartDate, end: weekEndDate },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-performance-digest:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
