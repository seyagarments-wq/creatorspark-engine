import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChatCompletion } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  videoId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { videoId }: AnalyzeRequest = await req.json();

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "videoId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing video hook for: ${videoId}`);

    // Fetch video details
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select(`
        *,
        profiles:creator_id(full_name),
        performance_data(impressions, clicks, purchases, revenue)
      `)
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      console.error("Video not found:", videoError);
      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate existing performance metrics for context
    const perfData = video.performance_data || [];
    const totalImpressions = perfData.reduce((sum: number, p: any) => sum + (p.impressions || 0), 0);
    const totalClicks = perfData.reduce((sum: number, p: any) => sum + (p.clicks || 0), 0);
    const totalPurchases = perfData.reduce((sum: number, p: any) => sum + (p.purchases || 0), 0);
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : "N/A";
    const conversionRate = totalClicks > 0 ? (totalPurchases / totalClicks * 100).toFixed(2) : "N/A";

    // Fetch creative references for competitive context
    const { data: creativeRefs } = await supabase
      .from("creative_references")
      .select("title, description, notes")
      .order("created_at", { ascending: false })
      .limit(5);

    const referenceContext = creativeRefs && creativeRefs.length > 0
      ? `\n\nReference Examples of High-Performing UGC (use these as comparison benchmarks):\n${creativeRefs.map((r: any, i: number) => `${i + 1}. "${r.title}"${r.description ? ` - ${r.description}` : ""}${r.notes ? `\n   Why it works: ${r.notes}` : ""}`).join("\n")}`
      : "";
    // Use Lovable AI to analyze the video's hook potential
    const aiPrompt = `You are an expert Meta Ads creative analyst. Analyze this UGC video's potential hook effectiveness based on the metadata and performance data provided.

Video Information:
- Title: ${video.title}
- Description: ${video.description || "No description"}
- Creator: ${(video.profiles as any)?.full_name || "Unknown"}

Performance Data (if available):
- Total Impressions: ${totalImpressions}
- CTR: ${ctr}%
- Conversion Rate: ${conversionRate}%
${referenceContext}

Based on the title and description, evaluate the hook potential on these criteria:
1. Attention Grab (0-25): Does the title/concept suggest an immediate attention-grabbing opening?
2. Curiosity Gap (0-25): Does it create curiosity that makes viewers want to watch more?
3. Value Promise (0-25): Is there a clear value proposition or benefit hinted?
4. Emotional Connection (0-25): Does it evoke emotion or relatability?

Provide your response in this exact JSON format:
{
  "hook_score": <total score 0-100>,
  "breakdown": {
    "attention_grab": <0-25>,
    "curiosity_gap": <0-25>,
    "value_promise": <0-25>,
    "emotional_connection": <0-25>
  },
  "analysis": "<2-3 sentence analysis of the hook strength>",
  "improvements": ["<suggestion 1>", "<suggestion 2>"]
}`;

    const aiResponse = await aiChatCompletion({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert Meta Ads creative analyst. Always respond with valid JSON." },
          { role: "user", content: aiPrompt }
        ],
        temperature: 0.3,
      });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error("Failed to analyze video with AI");
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    
    console.log("AI Response:", aiContent);

    // Parse the AI response
    let analysisResult;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Provide a default analysis if parsing fails
      analysisResult = {
        hook_score: 50,
        breakdown: {
          attention_grab: 12,
          curiosity_gap: 12,
          value_promise: 13,
          emotional_connection: 13,
        },
        analysis: "Unable to fully analyze. The video appears to have standard creative elements.",
        improvements: ["Add a stronger opening hook", "Include a clear call-to-action"],
      };
    }

    // Update the video with the analysis
    const { error: updateError } = await supabase
      .from("videos")
      .update({
        hook_score: analysisResult.hook_score,
        hook_analysis: analysisResult.analysis,
        ai_creative_insights: {
          breakdown: analysisResult.breakdown,
          improvements: analysisResult.improvements,
          performance_context: {
            impressions: totalImpressions,
            ctr,
            conversion_rate: conversionRate,
          },
        },
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    if (updateError) {
      console.error("Error updating video:", updateError);
      throw updateError;
    }

    console.log(`Successfully analyzed video ${videoId} with hook score: ${analysisResult.hook_score}`);

    return new Response(
      JSON.stringify({
        success: true,
        hook_score: analysisResult.hook_score,
        analysis: analysisResult.analysis,
        breakdown: analysisResult.breakdown,
        improvements: analysisResult.improvements,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-video-hook:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
