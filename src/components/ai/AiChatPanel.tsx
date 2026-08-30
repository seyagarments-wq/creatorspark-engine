import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Send, Loader2, Wrench, ShieldCheck, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; activity?: any[] };
type PendingAction = { tool: string; args: Record<string, unknown> };

const ACTION_LABELS: Record<string, string> = {
  approve_video: "Approve video",
  reject_video: "Reject video (final)",
  notify_creator: "Send notification to creator",
};

export function AiChatPanel({
  scope,
  suggestions,
}: {
  scope: "admin" | "creator";
  suggestions: string[];
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const persist = async (convId: string, role: "user" | "assistant", content: string, activity?: any[]) => {
    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role,
      content,
      tool_activity: activity ? (activity as any) : null,
    });
  };

  const ensureConversation = async (firstMessage: string) => {
    if (conversationId) return conversationId;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: auth.user.id, scope, title: firstMessage.slice(0, 60) })
      .select("id")
      .single();
    if (error) return null;
    setConversationId(data.id);
    return data.id;
  };

  const send = async (text: string, approvedActions: string[] = []) => {
    const content = text.trim();
    if (!content && approvedActions.length === 0) return;
    setLoading(true);
    setPending([]);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const nextMessages = content ? [...messages, { role: "user" as const, content }] : messages;
    if (content) setMessages(nextMessages);
    setInput("");

    const convId = await ensureConversation(content || "Action");
    if (convId && content) await persist(convId, "user", content);

    try {
      const { data, error } = await supabase.functions.invoke("ai-workbook", {
        body: { message: content, messages: history, approvedActions },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const reply: Msg = {
        role: "assistant",
        content: (data as any).text || "No response.",
        activity: (data as any).activity ?? [],
      };
      setMessages((prev) => [...prev, reply]);
      setPending(((data as any).pendingActions ?? []) as PendingAction[]);
      if (convId) await persist(convId, "assistant", reply.content, reply.activity);
    } catch (e: any) {
      const msg = e?.message?.includes("402")
        ? "AI credits are exhausted. Add credits to continue."
        : e?.message?.includes("429")
        ? "Rate limited. Wait a moment and try again."
        : e?.message || "Something went wrong.";
      toast({ title: "AI request failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setPending([]);
    setConversationId(null);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-14rem)] min-h-[420px]">
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="font-semibold">Ask anything about your data</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap shadow-soft",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60",
              )}
            >
              {m.content}
              {!!m.activity?.length && (
                <div className="mt-3 pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
                  {m.activity.map((a: any, idx: number) => (
                    <Badge key={idx} variant="secondary" className="gap-1 text-[11px]">
                      <Wrench className="w-3 h-3" />
                      {a.tool}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pending.length > 0 && (
          <Card className="p-4 border-primary/40">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm">Approval required</p>
            </div>
            <ul className="text-sm text-muted-foreground mb-3 space-y-1">
              {pending.map((p, i) => (
                <li key={i}>
                  {ACTION_LABELS[p.tool] ?? p.tool} — {JSON.stringify(p.args)}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => send("Approved — go ahead.", [...new Set(pending.map((p) => p.tool))])}
                disabled={loading}
              >
                Approve and run
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPending([])} disabled={loading}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="pt-3 mt-3 border-t border-border/60">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask a question or describe what you want done…"
            className="min-h-[52px] max-h-40 rounded-2xl resize-none"
          />
          <Button onClick={() => send(input)} disabled={loading || !input.trim()} size="icon" className="h-[52px] w-[52px] rounded-2xl">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-muted-foreground">Answers are generated from live platform data.</p>
          <Button variant="ghost" size="sm" onClick={newChat} className="text-xs">
            <Plus className="w-3 h-3 mr-1" /> New chat
          </Button>
        </div>
      </div>
    </div>
  );
}
