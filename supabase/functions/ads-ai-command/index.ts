import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { message, ads, conversation } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Missing message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the ads context for Claude — includes status from meta_objects
    const adsContext = (ads || []).map((ad: any) => ({
      object_id: ad.object_id,
      name: ad.object_name || ad.name,
      level: ad.level,
      status: ad.effective_status || ad.status || "UNKNOWN",
      spend: ad.spend,
      impressions: ad.impressions,
      clicks: ad.clicks,
      ctr: ad.ctr,
      cpc: ad.cpc,
      conversions: ad.conversions,
      campaign_id: ad.campaign_id,
      adset_id: ad.adset_id,
    }));

    const systemPrompt = `You are an AI assistant that helps manage Meta ads. You have access to the user's complete ad data including ALL ads, ad sets, and campaigns — even ones with zero spend or that are paused/archived.

Current ads data (${adsContext.length} objects):
${JSON.stringify(adsContext, null, 2)}

IMPORTANT STATUS INFO: Each object has a "status" field showing its real Meta status (ACTIVE, PAUSED, ARCHIVED, PENDING_REVIEW, DISAPPROVED, etc.).

When the user asks to pause or activate ads, use the "manage_ads" tool to return the structured action. Match ads by name pattern (case-insensitive substring match). You can filter by campaign name too — find the campaign first, then match ads within it.

When the user asks to duplicate, use the "duplicate_ads" tool.

When the user asks a question about their ads (like counts, spend, performance, status), answer directly from the data without using tools.

Be concise and helpful. Always confirm before taking action by describing what you found.`;

    const messages = [
      ...(conversation || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools: [
          {
            name: "manage_ads",
            description:
              "Propose a bulk status change for ads, ad sets, or campaigns. Returns the list of matching objects for user confirmation before execution.",
            input_schema: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["PAUSE", "ACTIVATE", "ARCHIVE"],
                  description: "The action to take",
                },
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      object_id: { type: "string", description: "The Meta object ID" },
                      name: { type: "string", description: "The name of the ad/adset/campaign" },
                      level: { type: "string", enum: ["ad", "adset", "campaign"] },
                    },
                    required: ["object_id", "name", "level"],
                  },
                  description: "The matched ads/adsets/campaigns",
                },
                confirmation_message: {
                  type: "string",
                  description: "A message asking the user to confirm the action",
                },
              },
              required: ["action", "matches", "confirmation_message"],
            },
          },
          {
            name: "duplicate_ads",
            description: "Propose duplicating ads, ad sets, or campaigns.",
            input_schema: {
              type: "object",
              properties: {
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      object_id: { type: "string" },
                      name: { type: "string" },
                      level: { type: "string", enum: ["ad", "adset", "campaign"] },
                    },
                    required: ["object_id", "name", "level"],
                  },
                },
                confirmation_message: { type: "string" },
              },
              required: ["matches", "confirmation_message"],
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Claude API error", details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    let textResponse = "";
    let toolAction = null;

    for (const block of data.content || []) {
      if (block.type === "text") {
        textResponse += block.text;
      } else if (block.type === "tool_use" && block.name === "manage_ads") {
        toolAction = block.input;
      } else if (block.type === "tool_use" && block.name === "duplicate_ads") {
        toolAction = { ...block.input, action: "DUPLICATE" };
      }
    }

    return new Response(
      JSON.stringify({
        text: textResponse,
        tool_action: toolAction,
        stop_reason: data.stop_reason,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ads-ai-command error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
