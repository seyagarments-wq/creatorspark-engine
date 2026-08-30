import { useEffect, useState, useRef } from "react";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MessageSquare,
  Send,
  Image as ImageIcon,
  Users,
  Hash,
  User,
  Inbox,
  Plus,
  Loader2,
  X,
  ArrowLeft,
  Smile,
  Trash2,
  Reply,
} from "lucide-react";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { StickerPicker } from "@/components/chat/StickerPicker";
import { AudioBubble } from "@/components/chat/AudioBubble";
import { format } from "date-fns";
import { toast } from "sonner";
import { useChatMediaUpload } from "@/hooks/use-chat-media-upload";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { useOnlinePresence } from "@/hooks/use-online-presence";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useIsMobile } from "@/hooks/use-mobile";

const QUICK_EMOJIS = ["❤️", "👍", "😂", "🔥", "🙌"];
const EMOJI_GRID = [
  "❤️","👍","😂","🔥","🙌","😍","🎉","💯","😊","👏",
  "🤩","😭","💪","✨","🫶","😎","🤔","👀","💀","🤣",
];
const MESSAGE_BATCH_SIZE = 1000;

interface ChatRoom {
  id: string;
  name: string;
  description: string | null;
  chat_type: string;
  icon_url?: string | null;
}

interface DirectMessage {
  id: string;
  participant1_id: string;
  participant2_id: string;
  created_at: string;
  other_user?: {
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
}

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean; // did current user react with this emoji?
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  reply_to_id?: string | null;
  reply_to?: {
    content: string;
    sender_name: string;
  } | null;
  sender?: {
    full_name: string;
    avatar_url?: string | null;
  };
  reactions?: Reaction[];
}

interface AdminUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
}

interface CreatorUser {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
}

type ChatType = "dm" | "group";

// Build a reactions summary from raw DB rows
function buildReactions(rows: { emoji: string; user_id: string }[], myUserId: string): Reaction[] {
  const map: Record<string, { count: number; reacted: boolean }> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = { count: 0, reacted: false };
    map[r.emoji].count++;
    if (r.user_id === myUserId) map[r.emoji].reacted = true;
  }
  return Object.entries(map).map(([emoji, { count, reacted }]) => ({ emoji, count, reacted }));
}

// Stacked avatar component for group chats
function StackedAvatars({ members }: { members: { full_name: string; avatar_url?: string | null }[] }) {
  const shown = members.slice(0, 3);
  return (
    <div className="relative flex items-center" style={{ width: 32, height: 32 }}>
      {shown.map((m, i) => (
        <div
          key={i}
          className="absolute rounded-full border-2 border-background overflow-hidden"
          style={{ width: 20, height: 20, left: i * 8, zIndex: shown.length - i }}
        >
          {m.avatar_url ? (
            <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-secondary flex items-center justify-center text-[8px] font-bold text-muted-foreground">
              {m.full_name?.[0] || "?"}
            </div>
          )}
        </div>
      ))}
      {shown.length === 0 && (
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <Hash className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export default function CreatorChat() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"all" | "groups" | "dms">("all");
  const [groupChats, setGroupChats] = useState<ChatRoom[]>([]);
  const [groupMembers, setGroupMembers] = useState<Record<string, { full_name: string; avatar_url?: string | null }[]>>({});
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<{ type: ChatType; id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [otherCreators, setOtherCreators] = useState<CreatorUser[]>([]);
  const [dmDialogOpen, setDmDialogOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ url: string; type: "image" | "video" | "audio" } | null>(null);
  const [userName, setUserName] = useState("User");
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; senderName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const { uploadMedia, uploading } = useChatMediaUpload();
  
  const { typingUsers, startTyping, stopTyping } = useTypingIndicator(
    selectedChat?.id || null,
    selectedChat?.type || "dm",
    user?.id
  );
  const { isUserOnline } = useOnlinePresence(user?.id, userName);

  // Mark chat as read when this page is opened
  useEffect(() => {
    if (user) {
      const lastReadKey = `chat_last_read_${user.id}`;
      localStorage.setItem(lastReadKey, new Date().toISOString());
    }
  }, [user]);

  const handleBackToList = () => setSelectedChat(null);

  useEffect(() => {
    if (user) {
      fetchChats();
      fetchAdmins();
      fetchOtherCreators();
      // Get current user's name
      supabase.from("profiles").select("full_name").eq("user_id", user.id).single().then(({ data }) => {
        if (data?.full_name) setUserName(data.full_name);
      });
    }
  }, [user]);

  // Profile cache for realtime messages
  const profileCacheRef = useRef<Map<string, { full_name: string; avatar_url?: string | null }>>(new Map());
  const reactionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 50);
  }, [messages]);

  useEffect(() => {
    if (!selectedChat) return;
    fetchMessages();

    const filter = selectedChat.type === "dm"
      ? `dm_id=eq.${selectedChat.id}`
      : `chat_id=eq.${selectedChat.id}`;

    const msgChannel = supabase
      .channel(`room-${selectedChat.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, async (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => {
          const optimistic = prev.find(m => m.id.startsWith("optimistic-") && m.content === newMsg.content && m.sender_id === newMsg.sender_id);
          const cached = profileCacheRef.current.get(newMsg.sender_id);
          if (cached) {
            newMsg.sender = cached;
          } else if (newMsg.sender_id) {
            supabase.from("profiles").select("user_id, full_name, avatar_url").eq("user_id", newMsg.sender_id).maybeSingle().then(({ data: profile }) => {
              if (profile) {
                profileCacheRef.current.set(newMsg.sender_id, profile);
                setMessages(p => p.map(m => m.id === newMsg.id ? { ...m, sender: profile } : m));
              }
            });
          }
          newMsg.reactions = [];
          if (optimistic) {
            return prev.map(m => m.id === optimistic.id ? { ...newMsg } : m);
          }
          return [...prev, newMsg];
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();

    const reactionChannel = supabase
      .channel(`reactions-${selectedChat.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        if (reactionDebounceRef.current) clearTimeout(reactionDebounceRef.current);
        reactionDebounceRef.current = setTimeout(() => fetchReactions(), 500);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(reactionChannel);
      if (reactionDebounceRef.current) clearTimeout(reactionDebounceRef.current);
    };
  }, [selectedChat]);

  async function fetchAdmins() {
    try {
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (adminRoles && adminRoles.length > 0) {
        const adminUserIds = adminRoles.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, avatar_url")
          .in("user_id", adminUserIds);
        setAdmins(profiles || []);
      }
    } catch (error) {
      console.error("Error fetching admins:", error);
    }
  }

  async function fetchOtherCreators() {
    try {
      const { data: creatorRoles } = await supabase.from("user_roles").select("user_id").eq("role", "creator");
      if (creatorRoles && creatorRoles.length > 0) {
        const creatorUserIds = creatorRoles.map(r => r.user_id).filter(id => id !== user?.id);
        if (creatorUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, user_id, full_name, avatar_url")
            .in("user_id", creatorUserIds)
            .eq("status", "active");
          setOtherCreators(profiles || []);
        }
      }
    } catch (error) {
      console.error("Error fetching creators:", error);
    }
  }

  async function fetchChats() {
    try {
      // Fetch memberships and DMs in parallel
      const [membershipsRes, dmsRes] = await Promise.all([
        supabase
          .from("group_chat_members")
          .select("chat_id")
          .eq("user_id", user?.id),
        supabase
          .from("direct_messages")
          .select("*")
          .or(`participant1_id.eq.${user?.id},participant2_id.eq.${user?.id}`)
          .order("created_at", { ascending: false }),
      ]);

      const memberships = membershipsRes.data;
      const dms = dmsRes.data;

      if (memberships && memberships.length > 0) {
        const chatIds = memberships.map((m) => m.chat_id);

        // Fetch chats and all members in parallel (not N+1)
        const [chatsRes, allMembersRes] = await Promise.all([
          supabase.from("group_chats").select("id, name, description, chat_type, icon_url").in("id", chatIds),
          supabase.from("group_chat_members").select("chat_id, user_id").in("chat_id", chatIds),
        ]);

        setGroupChats(chatsRes.data || []);

        const allMembers = allMembersRes.data || [];
        if (allMembers.length > 0) {
          const allUserIds = [...new Set(allMembers.map(m => m.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", allUserIds);

          const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
          const membersMap: Record<string, { full_name: string; avatar_url?: string | null }[]> = {};
          for (const m of allMembers) {
            if (!membersMap[m.chat_id]) membersMap[m.chat_id] = [];
            if (membersMap[m.chat_id].length < 3) {
              const profile = profileMap.get(m.user_id);
              if (profile) membersMap[m.chat_id].push(profile);
            }
          }
          setGroupMembers(membersMap);
        }
      }

      if (dms && dms.length > 0) {
        const otherUserIds = dms.map(dm =>
          dm.participant1_id === user?.id ? dm.participant2_id : dm.participant1_id
        );
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, avatar_url")
          .in("user_id", otherUserIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        const dmsWithUsers = dms.map(dm => ({
          ...dm,
          other_user: profileMap.get(dm.participant1_id === user?.id ? dm.participant2_id : dm.participant1_id),
        }));
        setDirectMessages(dmsWithUsers);
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createDM(adminUserId: string, adminName: string) {
    try {
      const { data: existing } = await supabase
        .from("direct_messages")
        .select("id")
        .or(`and(participant1_id.eq.${user?.id},participant2_id.eq.${adminUserId}),and(participant1_id.eq.${adminUserId},participant2_id.eq.${user?.id})`)
        .maybeSingle();

      if (existing) {
        setSelectedChat({ type: "dm", id: existing.id, name: adminName });
        setActiveTab("dms");
        setDmDialogOpen(false);
        return;
      }

      const { data: dm, error } = await supabase
        .from("direct_messages")
        .insert({ participant1_id: user?.id, participant2_id: adminUserId })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Started conversation with ${adminName}`);
      setDmDialogOpen(false);
      await fetchChats();
      setSelectedChat({ type: "dm", id: dm.id, name: adminName });
      setActiveTab("dms");
    } catch (error) {
      console.error("Error creating DM:", error);
      toast.error("Failed to start conversation");
    }
  }

  async function fetchMessages() {
    if (!selectedChat) return;

    try {
      const messagesData: any[] = [];
      let from = 0;

      while (true) {
        const pageQuery = selectedChat.type === "dm"
          ? supabase.from("messages").select("*").eq("dm_id", selectedChat.id)
          : supabase.from("messages").select("*").eq("chat_id", selectedChat.id);

        const { data: page, error } = await pageQuery
          .order("created_at", { ascending: false })
          .range(from, from + MESSAGE_BATCH_SIZE - 1);

        if (error) throw error;
        if (!page || page.length === 0) break;

        messagesData.push(...page);

        if (page.length < MESSAGE_BATCH_SIZE) break;
        from += MESSAGE_BATCH_SIZE;
      }

      const senderIds = [...new Set(messagesData.map((m) => m.sender_id).filter(Boolean))];
      const messageIds = messagesData.map((m) => m.id);

      const [profilesRes, reactionsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", senderIds),
        messageIds.length > 0
          ? supabase.from("message_reactions").select("message_id, emoji, user_id").in("message_id", messageIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      for (const [k, v] of profileMap) profileCacheRef.current.set(k, v);

      const reactionsMap: Record<string, { emoji: string; user_id: string }[]> = {};
      for (const r of reactionsRes.data || []) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push(r);
      }

      const messagesWithSenders = messagesData.map((m) => ({
        ...m,
        sender: m.sender_id ? profileMap.get(m.sender_id) : null,
        reactions: buildReactions(reactionsMap[m.id] || [], user?.id || ""),
      }));

      const messageMap = new Map(messagesWithSenders.map((m) => [m.id, m]));
      const enriched = messagesWithSenders.map((m) => {
        if (m.reply_to_id && messageMap.has(m.reply_to_id)) {
          const parent = messageMap.get(m.reply_to_id)!;
          return {
            ...m,
            reply_to: {
              content: parent.content,
              sender_name: (parent.sender as any)?.full_name || "Unknown",
            },
          };
        }
        return m;
      });

      setMessages(enriched.reverse());
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  }

  async function fetchReactions() {
    if (messages.length === 0) return;
    const messageIds = messages.map(m => m.id);
    const { data: reactions } = await supabase
      .from("message_reactions")
      .select("message_id, emoji, user_id")
      .in("message_id", messageIds);

    const reactionsMap: Record<string, { emoji: string; user_id: string }[]> = {};
    for (const r of (reactions as { message_id: string; emoji: string; user_id: string }[] || [])) {
      if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
      reactionsMap[r.message_id].push(r);
    }

    setMessages(prev => prev.map(m => ({
      ...m,
      reactions: buildReactions(reactionsMap[m.id] || [], user?.id || ""),
    })));
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!user) return;
    const msg = messages.find(m => m.id === messageId);
    const existing = msg?.reactions?.find(r => r.emoji === emoji && r.reacted);

    if (existing) {
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });
    }
    // Immediately refresh so the clicker sees the change without waiting for realtime
    await fetchReactions();
  }

  async function deleteMessage(messageId: string) {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) {
      toast.error("Failed to delete message");
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingMedia) || !selectedChat || !user) return;

    const content = newMessage.trim() || (pendingMedia ? (pendingMedia.type === "image" ? "📷 Photo" : pendingMedia.type === "audio" ? "🎤 Voice note" : "🎥 Video") : "");

    // Optimistic UI: show message instantly
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      content,
      sender_id: user.id,
      created_at: new Date().toISOString(),
      image_url: pendingMedia?.type === "image" ? pendingMedia.url : undefined,
      video_url: pendingMedia?.type === "video" ? pendingMedia.url : undefined,
      audio_url: pendingMedia?.type === "audio" ? pendingMedia.url : undefined,
      reply_to_id: replyTo?.id || null,
      reply_to: replyTo ? { content: replyTo.content, sender_name: replyTo.senderName } : null,
      sender: { full_name: userName, avatar_url: profileCacheRef.current.get(user.id)?.avatar_url || null },
      reactions: [],
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    const savedReplyTo = replyTo;
    setNewMessage("");
    setPendingMedia(null);
    setReplyTo(null);
    stopTyping(userName);

    try {
      const messageData: any = {
        sender_id: user.id,
        content,
      };

      if (savedReplyTo) messageData.reply_to_id = savedReplyTo.id;

      if (optimisticMsg.image_url) messageData.image_url = optimisticMsg.image_url;
      else if (optimisticMsg.audio_url) messageData.audio_url = optimisticMsg.audio_url;
      else if (optimisticMsg.video_url) messageData.video_url = optimisticMsg.video_url;

      if (selectedChat.type === "dm") messageData.dm_id = selectedChat.id;
      else messageData.chat_id = selectedChat.id;

      const { data: inserted, error } = await supabase.from("messages").insert(messageData).select("id").single();
      if (error) throw error;

      // Fire-and-forget notification
      supabase.functions.invoke("notify-chat-message", {
        body: {
          message_id: inserted?.id || "",
          sender_id: user.id,
          sender_name: userName,
          chat_id: selectedChat.type === "group" ? selectedChat.id : undefined,
          dm_id: selectedChat.type === "dm" ? selectedChat.id : undefined,
          content,
        },
      }).catch(() => {/* ignore */});
    } catch (error) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    }
  }

  async function sendSticker(stickerUrl: string) {
    if (!selectedChat || !user) return;
    try {
      const messageData: any = {
        sender_id: user.id,
        content: "🏷️ Sticker",
        image_url: stickerUrl,
        ...(replyTo ? { reply_to_id: replyTo.id } : {}),
      };
      if (selectedChat.type === "dm") messageData.dm_id = selectedChat.id;
      else messageData.chat_id = selectedChat.id;

      const { data: inserted, error } = await supabase
        .from("messages")
        .insert(messageData)
        .select("id")
        .single();
      if (error) throw error;
      setReplyTo(null);

      supabase.functions.invoke("notify-chat-message", {
        body: {
          message_id: inserted?.id || "",
          sender_id: user.id,
          sender_name: userName,
          chat_id: selectedChat.type === "group" ? selectedChat.id : undefined,
          dm_id: selectedChat.type === "dm" ? selectedChat.id : undefined,
          content: "Sent a sticker",
        },
      }).catch(() => {});
    } catch (error) {
      console.error("Error sending sticker:", error);
      toast.error("Failed to send sticker");
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const result = await uploadMedia(file, user.id);
    if (result) {
      if (result.imageUrl) setPendingMedia({ url: result.imageUrl, type: "image" });
      else if (result.videoUrl) setPendingMedia({ url: result.videoUrl, type: "video" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const formatTime = (date: string) => format(new Date(date), "h:mm a");

  const allChats = [
    ...groupChats.map(g => ({ type: "group" as ChatType, id: g.id, name: g.name, description: g.description })),
    ...directMessages.map(dm => ({
      type: "dm" as ChatType,
      id: dm.id,
      name: dm.other_user?.full_name || "Unknown",
      description: dm.other_user?.email || null,
      avatar_url: dm.other_user?.avatar_url,
    })),
  ];

  const renderChatList = (chats: typeof allChats) => (
    <ScrollArea className="flex-1">
      {chats.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No chats yet</p>
        </div>
      ) : (
        <div className="p-2">
          {chats.map((chat) => (
            <button
              key={`${chat.type}-${chat.id}`}
              onClick={() => setSelectedChat(chat)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                selectedChat?.id === chat.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              }`}
            >
              <div className="flex items-center gap-3">
                {chat.type === "dm" ? (
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={(chat as any).avatar_url || undefined} />
                    <AvatarFallback className="text-xs">{chat.name[0]}</AvatarFallback>
                  </Avatar>
                ) : (chat as any).icon_url ? (
                  <img src={(chat as any).icon_url} alt={chat.name} className="w-8 h-8 rounded-full object-cover shrink-0 border" />
                ) : (
                  <div className="shrink-0">
                    <StackedAvatars members={groupMembers[chat.id] || []} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{chat.name}</p>
                  {chat.description && (
                    <p className={`text-xs truncate ${selectedChat?.id === chat.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {chat.type === "dm" ? "Direct Message" : chat.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </ScrollArea>
  );

  const showChatList = !isMobile || !selectedChat;
  const showChatArea = !isMobile || selectedChat;

  // On mobile with a chat selected, go full-screen to maximise space
  const mobileFullScreen = isMobile && !!selectedChat;

  return (
    <CreatorLayout hideMobileNav={mobileFullScreen}>
      <div className={`${mobileFullScreen ? 'fixed inset-0 z-50 h-[100dvh]' : isMobile ? 'h-[calc(100dvh-7rem)]' : 'h-[calc(100vh-8rem)]'} flex ${mobileFullScreen ? '' : 'rounded-xl border'} bg-card overflow-hidden animate-fade-in`}>
        {/* Sidebar */}
        {showChatList && (
          <div className={`${isMobile ? 'w-full' : 'w-72'} border-r flex flex-col`}>
            <div className="p-3 md:p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2 text-sm md:text-base">
                <MessageSquare className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                Messages
              </h2>
              <Dialog open={dmDialogOpen} onOpenChange={setDmDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Plus className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start Direct Message</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[400px]">
                    <div className="space-y-1">
                      {admins.length > 0 && (
                        <>
                          <p className="text-xs font-semibold text-muted-foreground px-3 py-1.5 uppercase tracking-wider">Team</p>
                          {admins.map((admin) => (
                            <button
                              key={admin.id}
                              onClick={() => createDM(admin.user_id, admin.full_name)}
                              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                            >
                              <Avatar className="w-10 h-10">
                                <AvatarImage src={admin.avatar_url || undefined} />
                                <AvatarFallback>{admin.full_name?.[0] || "A"}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{admin.full_name}</p>
                                <Badge variant="secondary" className="text-[10px]">Team</Badge>
                              </div>
                            </button>
                          ))}
                        </>
                      )}
                      {otherCreators.length > 0 && (
                        <>
                          <p className="text-xs font-semibold text-muted-foreground px-3 py-1.5 uppercase tracking-wider mt-2">Creators</p>
                          {otherCreators.map((creator) => (
                            <button
                              key={creator.id}
                              onClick={() => createDM(creator.user_id, creator.full_name)}
                              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                            >
                              <Avatar className="w-10 h-10">
                                <AvatarImage src={creator.avatar_url || undefined} />
                                <AvatarFallback>{creator.full_name?.[0] || "C"}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{creator.full_name}</p>
                              </div>
                            </button>
                          ))}
                        </>
                      )}
                      {admins.length === 0 && otherCreators.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No users available</p>
                      )}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "groups" | "dms")} className="flex-1 flex flex-col">
              <div className="px-2 pt-2">
                <TabsList className="w-full h-9">
                  <TabsTrigger value="all" className="flex-1 text-xs md:text-sm">
                    <Inbox className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                    All
                  </TabsTrigger>
                  <TabsTrigger value="groups" className="flex-1 text-xs md:text-sm">
                    <Users className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                    Groups
                  </TabsTrigger>
                  <TabsTrigger value="dms" className="flex-1 text-xs md:text-sm">
                    <User className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                    DMs
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="all" className="flex-1 m-0">{renderChatList(allChats)}</TabsContent>
              <TabsContent value="groups" className="flex-1 m-0">{renderChatList(allChats.filter(c => c.type === "group"))}</TabsContent>
              <TabsContent value="dms" className="flex-1 m-0">{renderChatList(allChats.filter(c => c.type === "dm"))}</TabsContent>
            </Tabs>
          </div>
        )}

        {/* Chat area */}
        {showChatArea && (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selectedChat ? (
              <>
                {/* Header */}
                <div className="p-3 md:p-4 border-b flex items-center gap-2 md:gap-3">
                  {isMobile && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleBackToList}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  )}
                  {selectedChat.type === "dm" ? (
                    (() => {
                      const activeDm = directMessages.find(d => d.id === selectedChat.id);
                      return (
                        <Avatar className="w-8 h-8 md:w-10 md:h-10 shrink-0">
                          <AvatarImage src={activeDm?.other_user?.avatar_url || undefined} />
                          <AvatarFallback>{selectedChat.name[0]}</AvatarFallback>
                        </Avatar>
                      );
                    })()
                  ) : (
                    (() => {
                      const activeGroup = groupChats.find(g => g.id === selectedChat.id);
                      return activeGroup?.icon_url ? (
                        <img src={activeGroup.icon_url} alt={activeGroup.name} className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover shrink-0 border" />
                      ) : (
                        <div className="shrink-0">
                          <StackedAvatars members={groupMembers[selectedChat.id] || []} />
                        </div>
                      );
                    })()
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm md:text-base truncate">{selectedChat.name}</h3>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {selectedChat.type === "dm" ? "Direct Message" : "Group Chat"}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-3 md:p-4" ref={messagesScrollRef}>
                  <div className="space-y-3 md:space-y-4">
                    {messages.map((message) => {
                      const isOwn = message.sender_id === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex gap-2 md:gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
                          onMouseEnter={() => setHoveredMessageId(message.id)}
                          onMouseLeave={() => setHoveredMessageId(null)}
                        >
                          {/* Avatar */}
                          <Avatar className="h-7 w-7 md:h-8 md:w-8 shrink-0 self-end">
                            <AvatarImage src={message.sender?.avatar_url || undefined} />
                            <AvatarFallback className={`text-xs ${isOwn ? "bg-primary text-primary-foreground" : ""}`}>
                              {message.sender?.full_name?.[0] || (isOwn ? "Me" : "?")}
                            </AvatarFallback>
                          </Avatar>

                          <div className={`max-w-[75%] md:max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                            <p className="text-[10px] md:text-xs mb-1 text-muted-foreground">
                              {message.sender?.full_name || (isOwn ? "You" : "Unknown")}
                            </p>
                            <div className="relative group">
                              <div
                                className={`inline-block rounded-2xl overflow-hidden break-words ${
                                  isOwn ? "bg-primary text-primary-foreground" : "bg-secondary"
                } ${message.image_url || message.video_url || (message as any).audio_url ? "p-1" : "px-3 py-2 md:px-4"}`}
                                style={{ overflowWrap: "break-word", wordBreak: "break-word", maxWidth: "100%" }}
                              >
                                {/* Reply quote */}
                                {message.reply_to && (
                                  <div className={`border-l-2 border-primary/50 bg-primary/5 rounded px-2 py-1 mb-1 ${message.image_url || message.video_url || (message as any).audio_url ? "mx-1 mt-1" : ""}`}>
                                    <p className="text-[10px] font-semibold text-primary/70">{message.reply_to.sender_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{message.reply_to.content === "🏷️ Sticker" ? "Sticker" : message.reply_to.content}</p>
                                  </div>
                                )}
                                {message.image_url && message.content === "🏷️ Sticker" ? (
                                  <img
                                    src={message.image_url}
                                    alt="Sticker"
                                    className="w-28 h-28 md:w-32 md:h-32 object-contain"
                                    loading="lazy"
                                  />
                                ) : message.image_url ? (
                                  <img
                                    src={message.image_url}
                                    alt="Shared image"
                                    className="max-w-[280px] md:max-w-sm lg:max-w-md rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(message.image_url, "_blank")}
                                    loading="lazy"
                                  />
                                ) : null}
                                {message.video_url && (
                                  <video
                                    src={message.video_url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="max-w-[280px] md:max-w-sm lg:max-w-md rounded-xl"
                                  />
                                )}
                                {(message as any).audio_url && (
                                  <div className="px-2 py-1">
                                    <AudioBubble src={(message as any).audio_url} isOwn={isOwn} />
                                  </div>
                                )}
                                {message.content && !message.content.startsWith("📷") && !message.content.startsWith("🎥") && !message.content.startsWith("🎤") && message.content !== "🏷️ Sticker" && (
                                  <ChatMessageContent content={message.content} className={message.image_url || message.video_url || (message as any).audio_url ? "px-2 py-1.5 md:px-3 md:py-2" : ""} />
                                )}
                              </div>

                              {/* Quick-react bar (hover) */}
                              {hoveredMessageId === message.id && (
                                <div className={`absolute ${isOwn ? "right-full mr-2" : "left-full ml-2"} top-0 flex items-center gap-1 bg-popover border rounded-full px-2 py-1 shadow-md z-10`}>
                                  {QUICK_EMOJIS.map(emoji => (
                                    <button
                                      key={emoji}
                                      onClick={() => toggleReaction(message.id, emoji)}
                                      className="text-base hover:scale-125 transition-transform"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                  {/* More emojis */}
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="text-muted-foreground hover:text-foreground transition-colors">
                                        <Smile className="w-4 h-4" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-48 p-2" side="top">
                                      <div className="grid grid-cols-5 gap-1">
                                        {EMOJI_GRID.map(emoji => (
                                          <button
                                            key={emoji}
                                            onClick={() => toggleReaction(message.id, emoji)}
                                            className="text-xl hover:bg-muted rounded p-1 transition-colors"
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {/* Reply button */}
                                  <button
                                    onClick={() => setReplyTo({ id: message.id, content: message.content, senderName: message.sender?.full_name || "Unknown" })}
                                    className="text-muted-foreground hover:text-foreground transition-colors border-l pl-1"
                                    title="Reply"
                                  >
                                    <Reply className="w-4 h-4" />
                                  </button>
                                  {/* Delete button — only for own messages */}
                                  {isOwn && (
                                    <button
                                      onClick={() => deleteMessage(message.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors ml-1 border-l pl-1"
                                      title="Delete message"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Reaction pills */}
                            {(message.reactions || []).length > 0 && (
                              <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                {(message.reactions || []).map(r => (
                                  <button
                                    key={r.emoji}
                                    onClick={() => toggleReaction(message.id, r.emoji)}
                                    className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                      r.reacted
                                        ? "bg-primary/10 border-primary/40 text-primary"
                                        : "bg-muted border-border hover:bg-muted/80"
                                    }`}
                                  >
                                    <span>{r.emoji}</span>
                                    <span>{r.count}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
                              {formatTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <TypingIndicator names={typingUsers.map(u => u.name)} />
                )}

                {/* Input */}
                <form onSubmit={sendMessage} className="p-2 md:p-4 border-t safe-area-pb">
                  {/* Reply preview */}
                  {replyTo && (
                    <div className="mb-2 flex items-center gap-2 text-xs bg-primary/5 border-l-2 border-primary rounded-lg px-3 py-2">
                      <Reply className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-primary/80">{replyTo.senderName}</p>
                        <p className="truncate text-muted-foreground">{replyTo.content === "🏷️ Sticker" ? "Sticker" : replyTo.content}</p>
                      </div>
                      <button type="button" onClick={() => setReplyTo(null)} className="hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {pendingMedia && (
                    <div className="mb-2 md:mb-3 relative inline-block">
                      {pendingMedia.type === "image" ? (
                        <img src={pendingMedia.url} alt="Pending upload" className="h-16 md:h-20 rounded-lg" />
                      ) : pendingMedia.type === "audio" ? (
                        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                          <AudioBubble src={pendingMedia.url} isOwn={false} />
                        </div>
                      ) : (
                        <video src={pendingMedia.url} className="h-16 md:h-20 rounded-lg" />
                      )}
                      <button
                        type="button"
                        onClick={() => setPendingMedia(null)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-1.5 md:gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" className="hidden" />
                    
                    {/* Mobile: single + button that opens media options */}
                    {isMobile ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={uploading}
                          >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-auto p-2 flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <ImageIcon className="w-5 h-5" />
                          </Button>
                          <StickerPicker onSelect={sendSticker} disabled={uploading} size="sm" />
                          <VoiceRecorder
                            userId={user?.id || ""}
                            onRecorded={(url) => setPendingMedia({ url, type: "audio" })}
                            disabled={uploading || !!pendingMedia}
                            size="sm"
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                        >
                          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                        </Button>
                        <StickerPicker onSelect={sendSticker} disabled={uploading} size="sm" />
                      </>
                    )}
                    
                    <Textarea
                      placeholder={isMobile ? "Message…" : "Type a message… (Shift+Enter for new line)"}
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        if (e.target.value.trim()) startTyping(userName);
                      }}
                      onBlur={() => stopTyping(userName)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (newMessage.trim() || pendingMedia) {
                            (e.target as HTMLTextAreaElement).form?.requestSubmit();
                          }
                        }
                      }}
                      className="flex-1 min-h-[36px] max-h-[100px] resize-none h-9 md:h-10 text-sm"
                      rows={1}
                    />
                    
                    {/* Desktop: voice recorder inline */}
                    {!isMobile && (
                      <VoiceRecorder
                        userId={user?.id || ""}
                        onRecorded={(url) => setPendingMedia({ url, type: "audio" })}
                        disabled={uploading || !!pendingMedia}
                        size="sm"
                      />
                    )}
                    
                    <Button type="submit" size="icon" className="h-9 w-9 md:h-10 md:w-10 shrink-0" disabled={(!newMessage.trim() && !pendingMedia) || uploading}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center px-4">
                  <MessageSquare className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 md:mb-4" />
                  <h3 className="font-medium mb-2 text-sm md:text-base">Select a chat</h3>
                  <p className="text-xs md:text-sm">Choose a conversation to start messaging</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </CreatorLayout>
  );
}
