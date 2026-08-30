import { getSecret } from "./secrets.ts";

// Provider-agnostic AI layer.
// An admin can supply ANY of these keys on the in-app Setup page (or as a
// Supabase secret): OPENAI_API_KEY, LOVABLE_API_KEY or ANTHROPIC_API_KEY.
// Optionally AI_MODEL overrides the default model for the chosen provider.

export type AIProvider = {
  id: "openai" | "lovable" | "anthropic";
  label: string;
  key: string;
  chatUrl: string;
  responsesUrl: string | null;
  model: string;
};

export async function getAIProvider(): Promise<AIProvider | null> {
  const override = (await getSecret("AI_MODEL"))?.trim();

  const openai = await getSecret("OPENAI_API_KEY");
  if (openai) {
    return {
      id: "openai",
      label: "OpenAI",
      key: openai,
      chatUrl: "https://api.openai.com/v1/chat/completions",
      responsesUrl: "https://api.openai.com/v1/responses",
      model: override || "gpt-4o-mini",
    };
  }

  const lovable = await getSecret("LOVABLE_API_KEY");
  if (lovable) {
    return {
      id: "lovable",
      label: "Lovable AI Gateway",
      key: lovable,
      chatUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      responsesUrl: "https://ai.gateway.lovable.dev/v1/responses",
      model: override || "openai/gpt-5.6-sol",
    };
  }

  const anthropic = await getSecret("ANTHROPIC_API_KEY");
  if (anthropic) {
    return {
      id: "anthropic",
      label: "Anthropic",
      key: anthropic,
      chatUrl: "https://api.anthropic.com/v1/messages",
      responsesUrl: null,
      model: override || "claude-sonnet-4-20250514",
    };
  }

  return null;
}

const NO_PROVIDER_MESSAGE =
  "No AI provider is configured. Add an OpenAI, Anthropic or Lovable AI key in Admin → Setup.";

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Drop-in replacement for a direct chat-completions fetch.
 * Always resolves to an OpenAI-chat-shaped Response, whichever provider is set.
 */
export async function aiChatCompletion(
  body: Record<string, unknown>,
): Promise<Response> {
  const provider = await getAIProvider();
  if (!provider) return errorResponse(NO_PROVIDER_MESSAGE, 503);

  // Only honour a caller-supplied model when it matches the provider family
  // (gateway model ids look like "vendor/model").
  const requested = typeof body.model === "string" ? body.model : undefined;
  const model =
    provider.id === "lovable" && requested?.includes("/") ? requested : provider.model;

  if (provider.id === "anthropic") {
    const messages = (body.messages as { role: string; content: string }[]) ?? [];
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    const res = await fetch(provider.chatUrl, {
      method: "POST",
      headers: {
        "x-api-key": provider.key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: system || undefined,
        messages: rest,
        temperature: body.temperature,
      }),
    });

    if (!res.ok) return errorResponse(await res.text(), res.status);

    const data = await res.json();
    const text = (data?.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("\n");

    return new Response(
      JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload: Record<string, unknown> = { ...body, model };
  // OpenAI reasoning models reject custom temperatures.
  if (provider.id === "openai" && /^(o\d|gpt-5)/.test(model)) delete payload.temperature;

  return await fetch(provider.chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/** Simple text/JSON helper for one-shot prompts. */
export async function aiPrompt(
  system: string,
  user: string,
  opts: { temperature?: number; json?: boolean } = {},
): Promise<{ ok: boolean; content: string; status: number; error?: string }> {
  const res = await aiChatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: opts.temperature,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });

  const raw = await res.text();
  if (!res.ok) return { ok: false, content: "", status: res.status, error: raw };

  try {
    const data = JSON.parse(raw);
    return { ok: true, status: 200, content: data?.choices?.[0]?.message?.content ?? "" };
  } catch {
    return { ok: false, content: "", status: 500, error: "Unreadable AI response" };
  }
}
