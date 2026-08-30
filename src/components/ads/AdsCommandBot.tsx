import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Loader2, Check, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface ToolAction {
  action: "PAUSE" | "ACTIVATE" | "ARCHIVE" | "DUPLICATE";
  matches: { object_id: string; name: string; level: string }[];
  confirmation_message: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tool_action?: ToolAction | null;
  action_executed?: boolean;
}

export default function AdsCommandBot({ ads: propAds }: { ads?: any[] }) {
  // Self-fetch from meta_objects (all ads with real status) instead of ad_insights
  const { data: fetchedAds } = useQuery({
    queryKey: ["ads-bot-meta-objects"],
    queryFn: async () => {
      // Get all objects from meta_objects for structure + status
      const { data: metaObjects } = await supabase
        .from("meta_objects")
        .select("object_id, object_name, level, status, effective_status, campaign_id, adset_id")
        .order("object_name", { ascending: true })
        .limit(1000);

      // Get performance data from ad_insights
      const { data: insights } = await supabase
        .from("ad_insights")
        .select("object_id, spend, impressions, clicks, ctr, cpc, conversions")
        .order("spend", { ascending: false })
        .limit(1000);

      const insightsMap = new Map<string, any>();
      for (const row of insights || []) {
        if (!insightsMap.has(row.object_id)) insightsMap.set(row.object_id, row);
      }

      // Merge: all meta_objects with overlaid performance
      return (metaObjects || []).map((obj: any) => {
        const perf = insightsMap.get(obj.object_id);
        return {
          object_id: obj.object_id,
          object_name: obj.object_name,
          level: obj.level,
          status: obj.status,
          effective_status: obj.effective_status,
          campaign_id: obj.campaign_id,
          adset_id: obj.adset_id,
          spend: perf?.spend || 0,
          impressions: perf?.impressions || 0,
          clicks: perf?.clicks || 0,
          ctr: perf?.ctr || 0,
          cpc: perf?.cpc || 0,
          conversions: perf?.conversions || 0,
        };
      });
    },
    staleTime: 60_000,
  });

  const ads = propAds?.length ? propAds : fetchedAds || [];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const conversation = messages.map((m) => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("ads-ai-command", {
        body: { message: text, ads, conversation },
      });

      if (error) throw error;

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.tool_action?.confirmation_message || data.text || "I couldn't process that.",
        tool_action: data.tool_action || null,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Bot error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg.tool_action) return;

    setExecuting(true);
    const { action, matches } = msg.tool_action;
    let successCount = 0;
    let failCount = 0;

    if (action === "DUPLICATE") {
      for (const match of matches) {
        try {
          const { data, error } = await supabase.functions.invoke("manage-meta-ads", {
            body: { action: "duplicate", object_id: match.object_id, status_option: "PAUSED" },
          });
          if (error || data?.error) failCount++;
          else successCount++;
        } catch { failCount++; }
      }
    } else {
      const status = action === "PAUSE" ? "PAUSED" : action === "ARCHIVE" ? "ARCHIVED" : "ACTIVE";
      for (const match of matches) {
        try {
          const { data, error } = await supabase.functions.invoke("manage-meta-ads", {
            body: { action: "update_status", object_id: match.object_id, status },
          });
          if (error || data?.error) failCount++;
          else successCount++;
        } catch { failCount++; }
      }
    }

    const actionLabel = action === "PAUSE" ? "paused" : action === "ACTIVATE" ? "activated" : action === "ARCHIVE" ? "archived" : "duplicated";
    const resultText =
      failCount === 0
        ? `Done — ${successCount} ${successCount === 1 ? "item" : "items"} ${actionLabel} ✓`
        : `${successCount} succeeded, ${failCount} failed.`;

    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, action_executed: true } : m)).concat({
        role: "assistant",
        content: resultText,
      })
    );

    if (failCount > 0) toast.error(`${failCount} action(s) failed`);
    else toast.success(resultText);

    setExecuting(false);
  };

  const cancelAction = (msgIndex: number) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, action_executed: true } : m)).concat({
        role: "assistant",
        content: "Action cancelled.",
      })
    );
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-glow-md flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <Bot className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-8rem)] rounded-2xl bg-card border border-border/50 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Ad Command Bot</p>
                <p className="text-[10px] text-muted-foreground">Powered by Claude</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary/80 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <ScrollArea className="flex-1 p-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-xs mt-8 px-4 space-y-2">
                <Bot className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="font-medium text-sm text-foreground">What can I help with?</p>
                <p>"Pause all ads with 'summer' in the name"</p>
                <p>"Turn off ads in the Testing campaign"</p>
                <p>"How many active campaigns do I have?"</p>
                <p>"Duplicate ad X"</p>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary/80 text-foreground rounded-bl-md"
                    )}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "assistant" && msg.tool_action && !msg.action_executed && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => executeAction(i)}
                        disabled={executing}
                        className="h-8 text-xs gap-1.5"
                      >
                        {executing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelAction(i)}
                        disabled={executing}
                        className="h-8 text-xs gap-1.5"
                      >
                        <XCircle className="w-3 h-3" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Thinking…
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border/50">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a command…"
                disabled={loading || executing}
                className="flex-1 h-9 text-sm"
              />
              <Button type="submit" size="icon" disabled={!input.trim() || loading || executing} className="h-9 w-9 shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
