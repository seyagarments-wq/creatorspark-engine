import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Loader2, MessageCircle, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  message: string;
  created_at: string;
  user_id: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
  };
  isAdmin?: boolean;
}

interface VideoCommentThreadProps {
  videoId: string | null;
  videoTitle?: string;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoCommentThread({
  videoId,
  videoTitle,
  isAdmin,
  open,
  onOpenChange,
}: VideoCommentThreadProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoId || !open) return;
    fetchComments();

    const channel = supabase
      .channel(`video-comments-${videoId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "video_comments",
          filter: `video_id=eq.${videoId}`,
        },
        () => fetchComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId, open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  async function fetchComments() {
    if (!videoId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("video_comments")
        .select("id, message, created_at, user_id")
        .eq("video_id", videoId)
        .order("created_at", { ascending: true });

      if (!data) {
        setComments([]);
        return;
      }

      // Fetch profiles and roles for comment authors
      const userIds = [...new Set(data.map((c) => c.user_id))];
      
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);

      const profileMap = new Map(
        (profilesRes.data || []).map((p) => [p.user_id, p])
      );
      const adminSet = new Set(
        (rolesRes.data || []).filter((r) => r.role === "admin").map((r) => r.user_id)
      );

      setComments(
        data.map((c) => ({
          ...c,
          profile: profileMap.get(c.user_id) || undefined,
          isAdmin: adminSet.has(c.user_id),
        }))
      );
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!message.trim() || !videoId || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("video_comments").insert({
        video_id: videoId,
        user_id: user.id,
        message: message.trim(),
      });

      if (error) throw error;
      setMessage("");

      // Send notification to the other party
      try {
        if (isAdmin) {
          // Admin commenting -> notify the creator
          const { data: video } = await supabase
            .from("videos")
            .select("creator_id, title, profiles:creator_id(user_id)")
            .eq("id", videoId)
            .single();

          if (video?.profiles) {
            const creatorUserId = (video.profiles as any).user_id;
            await supabase.functions.invoke("send-notification-email", {
              body: {
                user_id: creatorUserId,
                title: "New feedback on your video",
                message: `You have new feedback on "${video.title}"`,
                notification_type: "video",
                link: "/creator/videos",
              },
            });
          }
        } else {
          // Check if commenter is a mentor with an active assignment for this video's creator
          const { data: myProfile } = await supabase
            .from("profiles")
            .select("id, is_mentor, full_name")
            .eq("user_id", user.id)
            .single();

          if (myProfile?.is_mentor) {
            // Mentor commenting -> notify the creator
            const { data: video } = await supabase
              .from("videos")
              .select("creator_id, title, profiles:creator_id(user_id)")
              .eq("id", videoId)
              .single();

            if (video?.profiles) {
              const creatorUserId = (video.profiles as any).user_id;
              await supabase.functions.invoke("send-notification-email", {
                body: {
                  user_id: creatorUserId,
                  title: `${myProfile.full_name} left feedback on your video`,
                  message: `Your mentor ${myProfile.full_name} left feedback on "${video.title}". Review their notes and apply them to your next submission.`,
                  notification_type: "video",
                  link: "/creator/my-videos",
                  button_text: "View Feedback",
                },
              });
            }
          }

          // Also notify admins
          const { data: adminRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");

          const { data: video } = await supabase
            .from("videos")
            .select("title")
            .eq("id", videoId)
            .single();

          for (const admin of adminRoles || []) {
            await supabase.functions.invoke("send-notification-email", {
              body: {
                user_id: admin.user_id,
                title: "Creator replied to feedback",
                message: `A creator replied on "${video?.title || "a video"}"`,
                notification_type: "video",
                link: "/admin/submissions",
              },
            });
          }
        }
      } catch {
        // Notification failures shouldn't block
      }
    } catch (error) {
      console.error("Error sending comment:", error);
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0 !w-full sm:!w-auto sm:max-w-md">
        <SheetHeader className="p-4 border-b" style={{ paddingTop: `max(1rem, env(safe-area-inset-top))` }}>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="w-5 h-5 text-amber-500" />
              <span className="truncate">
                {videoTitle ? `Comments — ${videoTitle}` : "Video Comments"}
              </span>
            </SheetTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm p-1 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </SheetHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <MessageCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No comments yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Start the conversation about this video
              </p>
            </div>
          ) : (
            comments.map((comment) => {
              const isMine = comment.user_id === user?.id;
              return (
                <div
                  key={comment.id}
                  className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback
                      className={`text-[10px] ${
                        comment.isAdmin
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {comment.profile?.full_name?.slice(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[75%] ${
                      isMine ? "items-end" : "items-start"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium">
                        {comment.profile?.full_name || "Unknown"}
                      </span>
                      {comment.isAdmin && (
                        <span className="text-[10px] px-1.5 py-0 rounded-full bg-primary/10 text-primary font-medium">
                          Admin
                        </span>
                      )}
                    </div>
                    <div
                      className={`rounded-xl px-3 py-2 text-sm ${
                        isMine
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {comment.message}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      {formatDistanceToNow(new Date(comment.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        <div className="border-t p-3" style={{ paddingBottom: `max(0.75rem, env(safe-area-inset-bottom))` }}>
          <div className="flex gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a comment..."
              className="min-h-[40px] max-h-[100px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="shrink-0 h-10 w-10"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
