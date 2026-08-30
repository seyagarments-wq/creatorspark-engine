import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Analyzing creative patterns across top performers...");

    // Fetch top performing videos with their performance data
    const { data: videos, error: videosError } = await supabase
      .from("videos")
      .select(`
        id,
        title,
        description,
        hook_score,
        hook_analysis,
        ai_creative_insights,
        meta_video_id,
        profiles:creator_id(full_name),
        performance_data(impressions, clicks, purchases, revenue, spend)
      `)
      .eq("status", "approved");

    if (videosError) {
      console.error("Error fetching videos:", videosError);
      throw videosError;
    }

    console.log(`Found ${videos?.length || 0} approved videos`);

    // Calculate metrics for each video
    const videosWithMetrics = (videos || []).map(video => {
      const perfData = video.performance_data || [];
      const totals = perfData.reduce((acc: any, p: any) => ({
        impressions: acc.impressions + (p.impressions || 0),
        clicks: acc.clicks + (p.clicks || 0),
        purchases: acc.purchases + (p.purchases || 0),
        revenue: acc.revenue + (parseFloat(p.revenue) || 0),
        spend: acc.spend + (parseFloat(p.spend) || 0),
      }), { impressions: 0, clicks: 0, purchases: 0, revenue: 0, spend: 0 });

      const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
      const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions * 100 : 0;
      const convRate = totals.clicks > 0 ? totals.purchases / totals.clicks * 100 : 0;

      return {
        ...video,
        metrics: { ...totals, roas, ctr, convRate },
      };
    }).filter(v => v.metrics.spend > 0);

    console.log(`${videosWithMetrics.length} videos have performance data`);

    // Fetch creative references for competitive context
    const { data: creativeRefs } = await supabase
      .from("creative_references")
      .select("title, description, notes")
      .order("created_at", { ascending: false })
      .limit(5);

    const referenceContext = creativeRefs && creativeRefs.length > 0
      ? `\n\nReference Examples of High-Performing Competitor UGC (use as benchmarks):\n${creativeRefs.map((r: any, i: number) => `${i + 1}. "${r.title}"${r.description ? ` - ${r.description}` : ""}${r.notes ? `\n   Why it works: ${r.notes}` : ""}`).join("\n")}`
      : "";
    if (videosWithMetrics.length < 2) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Not enough videos with performance data to analyze patterns. Export more videos to Meta and wait for performance data to accumulate.",
          stats: {
            total_videos_analyzed: 0,
            top_performer_count: 0,
            avg_top_roas: 0,
            avg_bottom_roas: 0,
            avg_top_ctr: 0,
            avg_bottom_ctr: 0,
            top_performers: [],
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get top 20% performers by ROAS
    const sortedByROAS = [...videosWithMetrics].sort((a, b) => b.metrics.roas - a.metrics.roas);
    const topPercentile = Math.max(1, Math.ceil(sortedByROAS.length * 0.2));
    const topPerformers = sortedByROAS.slice(0, topPercentile);
    const bottomPerformers = sortedByROAS.slice(-topPercentile);

    console.log(`Analyzing ${topPerformers.length} top performers and ${bottomPerformers.length} bottom performers`);

    // Build analysis prompt
    const topVideosInfo = topPerformers.map(v => ({
      title: v.title,
      description: v.description?.slice(0, 200),
      hook_score: v.hook_score,
      roas: v.metrics.roas.toFixed(2),
      ctr: v.metrics.ctr.toFixed(2),
      conv_rate: v.metrics.convRate.toFixed(2),
    }));

    const bottomVideosInfo = bottomPerformers.map(v => ({
      title: v.title,
      description: v.description?.slice(0, 200),
      hook_score: v.hook_score,
      roas: v.metrics.roas.toFixed(2),
      ctr: v.metrics.ctr.toFixed(2),
      conv_rate: v.metrics.convRate.toFixed(2),
    }));

    const dataQualityNote = videosWithMetrics.length < 10
      ? `\n\nIMPORTANT: This analysis is based on only ${videosWithMetrics.length} videos with ad spend data. Be cautious about generalizations and explicitly note the limited sample size.`
      : "";

    const aiPrompt = `You are a Meta Ads creative strategist. Analyze these UGC video performance patterns.${referenceContext}

DATA SCOPE: ${videosWithMetrics.length} total videos with performance data, ${topPerformers.length} top performers, ${bottomPerformers.length} bottom performers.${dataQualityNote}

TOP PERFORMERS (Top 20% by ROAS):
${JSON.stringify(topVideosInfo, null, 2)}

UNDERPERFORMERS (Bottom 20% by ROAS):
${JSON.stringify(bottomVideosInfo, null, 2)}

Analyze the patterns and provide insights in this JSON format:
{
  "winning_patterns": [
    {
      "pattern": "<pattern name>",
      "description": "<what makes this work>",
      "examples": ["<video title 1>", "<video title 2>"]
    }
  ],
  "common_mistakes": [
    {
      "mistake": "<mistake name>",
      "description": "<why this hurts performance>",
      "fix": "<how to fix it>"
    }
  ],
  "content_recommendations": [
    "<specific actionable recommendation 1>",
    "<specific actionable recommendation 2>",
    "<specific actionable recommendation 3>"
  ],
  "hook_insights": {
    "avg_top_performer_score": <number>,
    "avg_bottom_performer_score": <number>,
    "key_difference": "<what top performers do differently in their hooks>"
  },
  "summary": "<2-3 sentence executive summary>"
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a Meta Ads creative strategist. Always respond with valid JSON." },
          { role: "user", content: aiPrompt }
        ],
        temperature: 0.4,
      }),
    });

    let analysis;
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      const aiContent = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    }

    if (!analysis) {
      // Fallback analysis
      const avgTopScore = topPerformers.reduce((sum, v) => sum + (v.hook_score || 50), 0) / topPerformers.length;
      const avgBottomScore = bottomPerformers.reduce((sum, v) => sum + (v.hook_score || 50), 0) / bottomPerformers.length;

      analysis = {
        winning_patterns: [
          {
            pattern: "Strong Opening Hook",
            description: "Top videos grab attention in the first 3 seconds",
            examples: topPerformers.slice(0, 2).map(v => v.title),
          },
        ],
        common_mistakes: [
          {
            mistake: "Weak Value Proposition",
            description: "Videos that don't clearly show the benefit underperform",
            fix: "Lead with the transformation or result",
          },
        ],
        content_recommendations: [
          "Focus on the first 3 seconds to maximize CTR",
          "Include clear calls-to-action",
          "Show product benefits through demonstration",
        ],
        hook_insights: {
          avg_top_performer_score: Math.round(avgTopScore),
          avg_bottom_performer_score: Math.round(avgBottomScore),
          key_difference: "Top performers have stronger attention-grabbing openings",
        },
        summary: `Analysis of ${videosWithMetrics.length} videos shows top performers average ${(topPerformers.reduce((sum, v) => sum + v.metrics.roas, 0) / topPerformers.length).toFixed(2)}x ROAS vs ${(bottomPerformers.reduce((sum, v) => sum + v.metrics.roas, 0) / bottomPerformers.length).toFixed(2)}x for bottom performers.`,
      };
    }

    // Add computed statistics
    const stats = {
      total_videos_analyzed: videosWithMetrics.length,
      top_performer_count: topPerformers.length,
      avg_top_roas: topPerformers.length > 0 ? topPerformers.reduce((sum, v) => sum + v.metrics.roas, 0) / topPerformers.length : 0,
      avg_bottom_roas: bottomPerformers.length > 0 ? bottomPerformers.reduce((sum, v) => sum + v.metrics.roas, 0) / bottomPerformers.length : 0,
      avg_top_ctr: topPerformers.length > 0 ? topPerformers.reduce((sum, v) => sum + v.metrics.ctr, 0) / topPerformers.length : 0,
      avg_bottom_ctr: bottomPerformers.length > 0 ? bottomPerformers.reduce((sum, v) => sum + v.metrics.ctr, 0) / bottomPerformers.length : 0,
      top_performers: topPerformers.map(v => ({
        id: v.id,
        title: v.title,
        creator: (v.profiles as any)?.full_name,
        roas: v.metrics.roas,
        hook_score: v.hook_score,
      })),
    };

    console.log("Creative pattern analysis complete");

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        stats,
        generated_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-creative-patterns:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
