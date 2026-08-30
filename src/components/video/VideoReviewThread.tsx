import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ReviewMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  created_at: string;
  is_admin: boolean;
}

interface VideoReviewThreadProps {
  videoId: string;
  videoTitle?: string;
}

export function VideoReviewThread({ videoId, videoTitle }: VideoReviewThreadProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ReviewMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();

    // Subscribe to realtime
    const channel = supabase
      .channel(`review-${videoId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "video_review_messages",
        filter: `video_id=eq.${videoId}`,
      }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [videoId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchMessages() {
    try {
      const { data, error } = await supabase
        .from("video_review_messages")
        .select("id, content, sender_id, created_at")
        .eq("video_id", videoId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      // Resolve sender names
      const senderIds = [...new Set(data.map(m => m.sender_id))];
      
      // Get profiles by user_id
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", senderIds);

      // Get roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", senderIds);

      const nameMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

      setMessages(data.map(m => ({
        ...m,
        sender_name: nameMap.get(m.sender_id) || "Unknown",
        is_admin: roleMap.get(m.sender_id) === "admin",
      })));
    } catch (err) {
      console.error("Error fetching review messages:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!newMessage.trim() || !user) return;
    setSending(true);

    try {
      const { error } = await supabase
        .from("video_review_messages")
        .insert({
          video_id: videoId,
          sender_id: user.id,
          content: newMessage.trim(),
        });

      if (error) throw error;
      setNewMessage("");
    } catch (err) {
      console.error("Error sending review message:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold">Review Discussion</span>
        {messages.length > 0 && (
          <span className="text-[10px] text-muted-foreground">({messages.length})</span>
        )}
      </div>

      <div ref={scrollRef} className="max-h-[200px] overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            No messages yet. Start a discussion about this video.
          </p>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex gap-2 ${msg.sender_id === user?.id ? "flex-row-reverse" : ""}`}>
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarFallback className={`text-[10px] ${msg.is_admin ? "bg-primary/20 text-primary" : "bg-accent text-accent-foreground"}`}>
                  {msg.sender_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={`max-w-[80%] ${msg.sender_id === user?.id ? "items-end" : ""}`}>
                <div className={`px-2.5 py-1.5 rounded-lg text-xs ${
                  msg.sender_id === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}>
                  {msg.content}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 ${msg.sender_id === user?.id ? "justify-end" : ""}`}>
                  <span className="text-[10px] text-muted-foreground">{msg.sender_name}</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-t flex gap-2">
        <Textarea
          placeholder="Discuss this video..."
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          className="min-h-[36px] max-h-[80px] text-xs resize-none"
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
          className="shrink-0 self-end"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}
