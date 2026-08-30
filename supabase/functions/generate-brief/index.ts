import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/secrets.ts";
import { aiChatCompletion } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateBriefRequest {
  brandId: string;
  goal?: string;
  contentType?: string;
  targetAudience?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = (await getSecret("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { brandId, goal, contentType, targetAudience }: GenerateBriefRequest = await req.json();

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "brandId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch brand information
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("name, description")
      .eq("id", brandId)
      .single();

    if (brandError || !brand) {
      console.error("Brand fetch error:", brandError);
      return new Response(
        JSON.stringify({ error: "Brand not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch recent top-performing videos for context
    const { data: topVideos } = await supabase
      .from("videos")
      .select(`
        title,
        performance_data(impressions, purchases, revenue, spend)
      `)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(10);

    // Analyze top performers
    const topPerformers = topVideos?.map((video: any) => {
      const perfData = video.performance_data || [];
      const totalRevenue = perfData.reduce((sum: number, pd: any) => sum + (parseFloat(pd.revenue) || 0), 0);
      const totalSpend = perfData.reduce((sum: number, pd: any) => sum + (parseFloat(pd.spend) || 0), 0);
      const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      return { title: video.title, roas };
    }).filter((v: any) => v.roas > 1.5).slice(0, 5) || [];

    const topVideoContext = topPerformers.length > 0
      ? `Recent top-performing video themes: ${topPerformers.map((v: any) => v.title).join(", ")}`
      : "Focus on authentic, relatable content that showcases the product in real-life scenarios.";

    const systemPrompt = `You are an expert UGC (User-Generated Content) creative director. Generate creative briefs for creators that result in high-performing ad content.

Key principles for effective UGC:
- Hook viewers in the first 2 seconds
- Show authentic, relatable moments
- Demonstrate clear product benefits
- Include a strong call-to-action
- Avoid overly polished or scripted content

Brand: ${brand.name}
${brand.description ? `Brand Description: ${brand.description}` : ""}
${topVideoContext}`;

    const userPrompt = `Create a creative brief for UGC creators with the following parameters:
${goal ? `Campaign Goal: ${goal}` : "Campaign Goal: Drive sales and brand awareness"}
${contentType ? `Content Type: ${contentType}` : "Content Type: Short-form video (15-60 seconds)"}
${targetAudience ? `Target Audience: ${targetAudience}` : "Target Audience: General consumers interested in quality products"}

Generate a structured brief including:
1. A catchy title for the campaign
2. A compelling description (2-3 sentences)
3. Detailed guidelines for creators
4. 4-5 specific "Do's" (things creators should include)
5. 4-5 specific "Don'ts" (things to avoid)

Format your response as JSON with this structure:
{
  "title": "Campaign title",
  "description": "Brief description",
  "guidelines": "Detailed creative guidelines",
  "dos": ["Do item 1", "Do item 2", ...],
  "donts": ["Don't item 1", "Don't item 2", ...]
}`;

    console.log("Calling Lovable AI for brief generation...");

    const response = await aiChatCompletion({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse the JSON response
    let briefData;
    try {
      briefData = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        briefData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Invalid JSON in AI response");
      }
    }

    console.log("Brief generated successfully:", briefData.title);

    return new Response(
      JSON.stringify({
        success: true,
        brief: {
          title: briefData.title,
          description: briefData.description,
          guidelines: briefData.guidelines,
          dos: briefData.dos || [],
          donts: briefData.donts || [],
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating brief:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
