import { useEffect, useState, useRef } from "react";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
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
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Plus, Send, Users, User, Hash, Image as ImageIcon, Loader2, X, ArrowLeft, Clock, Trash2, Smile, Camera, Trash, UserPlus, UserMinus, Reply } from "lucide-react";
import { QuickReplyPopover } from "@/components/admin/QuickReplyPopover";
import { StickerPicker } from "@/components/chat/StickerPicker";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { AudioBubble } from "@/components/chat/AudioBubble";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { format, addDays } from "date-fns";
import { useChatMediaUpload } from "@/hooks/use-chat-media-upload";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["❤️", "👍", "😂", "🔥", "🙌"];
const EMOJI_GRID = [
  "❤️","👍","😂","🔥","🙌","😍","🎉","💯","😊","👏",
  "🤩","😭","💪","✨","🫶","😎","🤔","👀","💀","🤣",
];
const MESSAGE_BATCH_SIZE = 1000;

interface GroupChat {
  id: string;
  name: string;
  description: string | null;
  chat_type: string;
  created_at: string;
  icon_url?: string | null;
  members?: { full_name: string; avatar_url?: string | null }[];
}

interface DirectMessage {
  id: string;
  participant1_id: string;
  participant2_id: string;
  created_at: string;
  other_user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
  participant1_user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
  participant2_user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
  display_name: string;
  display_avatar_url?: string | null;
}

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
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

interface ScheduledMessage {
  id: string;
  sender_id: string;
  chat_id: string | null;
  dm_id: string | null;
  content: string;
  image_url: string | null;
  scheduled_at: string;
  sent: boolean;
  created_at: string;
}

interface Creator {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
}

type ChatType = "dm" | "group";

function buildReactions(rows: { emoji: string; user_id: string }[], myUserId: string): Reaction[] {
  const map: Record<string, { count: number; reacted: boolean }> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = { count: 0, reacted: false };
    map[r.emoji].count++;
    if (r.user_id === myUserId) map[r.emoji].reacted = true;
  }
  return Object.entries(map).map(([emoji, { count, reacted }]) => ({ emoji, count, reacted }));
}

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

export default function AdminChat() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"dms" | "groups">("groups");
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<{ type: ChatType; id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dmDialogOpen, setDmDialogOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [newChatDescription, setNewChatDescription] = useState("");
  const [newChatIconUrl, setNewChatIconUrl] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const editIconInputRef = useRef<HTMLInputElement>(null);
  const [editingIconChatId, setEditingIconChatId] = useState<string | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ url: string; type: "image" | "video" | "audio" } | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; senderName: string } | null>(null);
  const [adminName, setAdminName] = useState("Admin");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const { uploadMedia, uploading } = useChatMediaUpload();

  // Scheduling state
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [showScheduled, setShowScheduled] = useState(false);

  // Manage members state
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [currentMembers, setCurrentMembers] = useState<{ user_id: string; full_name: string; avatar_url?: string | null; member_row_id: string }[]>([]);
  const [membersToAdd, setMembersToAdd] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const manageMembersIconRef = useRef<HTMLInputElement>(null);

  // Handle URL params for opening specific DM
  useEffect(() => {
    const dmId = searchParams.get("dm");
    const dmName = searchParams.get("name");
    
    if (dmId && dmName) {
      setSelectedChat({ type: "dm", id: dmId, name: decodeURIComponent(dmName) });
      setActiveTab("dms");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    async function init() {
      await Promise.all([fetchChats(), fetchCreators(), fetchScheduledMessages()]);
      if (user) {
        supabase.from("profiles").select("full_name").eq("user_id", user.id).single().then(({ data }) => {
          if (data?.full_name) setAdminName(data.full_name);
        });
      }
    }
    init();
  }, []);

  // Auto-create DMs for all creators that don't have one with this admin
  const hasEnsuredDMs = useRef(false);
  useEffect(() => {
    if (!user || creators.length === 0 || hasEnsuredDMs.current) return;
    hasEnsuredDMs.current = true;

    async function ensureAllCreatorDMs() {
      try {
        const { data: existingDMs } = await supabase
          .from("direct_messages")
          .select("id, participant1_id, participant2_id")
          .or(`participant1_id.eq.${user!.id},participant2_id.eq.${user!.id}`);

        // Group DMs by partner user ID to find duplicates
        const dmsByPartner = new Map<string, typeof existingDMs>();
        for (const dm of existingDMs || []) {
          const partnerId = dm.participant1_id === user!.id ? dm.participant2_id : dm.participant1_id;
          if (!dmsByPartner.has(partnerId)) {
            dmsByPartner.set(partnerId, []);
          }
          dmsByPartner.get(partnerId)!.push(dm);
        }

        // Deduplicate: for partners with multiple DMs, keep the oldest and delete the rest
        const idsToDelete: string[] = [];
        for (const [, dms] of dmsByPartner) {
          if (dms!.length > 1) {
            // Sort by id (uuid v4 isn't time-sortable, so just keep first)
            const sorted = [...dms!];
            // Keep the first one, delete the rest
            for (let i = 1; i < sorted.length; i++) {
              idsToDelete.push(sorted[i].id);
            }
          }
        }

        if (idsToDelete.length > 0) {
          // Delete messages in duplicate DMs first
          await supabase.from("messages").delete().in("dm_id", idsToDelete);
          await supabase.from("direct_messages").delete().in("id", idsToDelete);
        }

        // Now create missing DMs
        const existingPartners = new Set(dmsByPartner.keys());
        const creatorsWithoutDM = creators.filter(c => !existingPartners.has(c.user_id));

        if (creatorsWithoutDM.length > 0) {
          const newDMs = creatorsWithoutDM.map(c => ({
            participant1_id: user!.id,
            participant2_id: c.user_id,
          }));
          await supabase.from("direct_messages").insert(newDMs);
        }

        if (idsToDelete.length > 0 || creatorsWithoutDM.length > 0) {
          await fetchChats();
        }
      } catch (err) {
        console.error("Error ensuring creator DMs:", err);
      }
    }

    ensureAllCreatorDMs();
  }, [creators, user]);

  // Profile cache for realtime messages
  const profileCacheRef = useRef<Map<string, { full_name: string; avatar_url?: string | null }>>(new Map());
  // Debounce timer for reaction refetches
  const reactionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 50);
  }, [messages]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages();
      
      const filter = selectedChat.type === "dm" 
        ? `dm_id=eq.${selectedChat.id}`
        : `chat_id=eq.${selectedChat.id}`;
      
      const channel = supabase
        .channel(`chat-${selectedChat.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, async (payload) => {
          const newMsg = payload.new as Message;
          // Deduplicate optimistic messages
          setMessages((prev) => {
            const optimistic = prev.find(m => m.id.startsWith("optimistic-") && m.content === newMsg.content && m.sender_id === newMsg.sender_id);
            // Resolve sender from cache first
            const cached = profileCacheRef.current.get(newMsg.sender_id);
            if (cached) {
              newMsg.sender = cached;
            } else if (newMsg.sender_id) {
              // Fetch and cache in background (non-blocking)
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
        .channel(`admin-reactions-${selectedChat.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
          // Debounce reaction refetches to avoid hammering
          if (reactionDebounceRef.current) clearTimeout(reactionDebounceRef.current);
          reactionDebounceRef.current = setTimeout(() => fetchReactions(), 500);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(reactionChannel);
        if (reactionDebounceRef.current) clearTimeout(reactionDebounceRef.current);
      };
    }
  }, [selectedChat]);

  async function fetchChats() {
    try {
      // Fetch groups and DMs in parallel
      const [groupsRes, dmsRes] = await Promise.all([
        supabase
          .from("group_chats")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("direct_messages")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      const groups = groupsRes.data || [];
      const dms = dmsRes.data || [];

      // Fetch ALL group chat members + profiles in 2 batch queries instead of N+1
      if (groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        const { data: allMembers } = await supabase
          .from("group_chat_members")
          .select("chat_id, user_id")
          .in("chat_id", groupIds);

        if (allMembers && allMembers.length > 0) {
          const allUserIds = [...new Set(allMembers.map(m => m.user_id))];
          const { data: memberProfiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", allUserIds);

          const profileMap = new Map(memberProfiles?.map(p => [p.user_id, p]) || []);

          // Group members by chat_id, take first 3
          const membersByChatId: Record<string, { full_name: string; avatar_url?: string | null }[]> = {};
          for (const m of allMembers) {
            if (!membersByChatId[m.chat_id]) membersByChatId[m.chat_id] = [];
            if (membersByChatId[m.chat_id].length < 3) {
              const profile = profileMap.get(m.user_id);
              if (profile) membersByChatId[m.chat_id].push(profile);
            }
          }

          setGroupChats(groups.map(g => ({ ...g, members: membersByChatId[g.id] || [] })));
        } else {
          setGroupChats(groups.map(g => ({ ...g, members: [] })));
        }
      } else {
        setGroupChats([]);
      }

      // DMs - batch fetch both participant profiles so admin can distinguish threads they aren't part of
      if (dms.length > 0) {
        const participantIds = [...new Set(dms.flatMap((dm) => [dm.participant1_id, dm.participant2_id]))];

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, avatar_url")
          .in("user_id", participantIds);

        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

        setDirectMessages(dms.map((dm) => {
          const participant1User = profileMap.get(dm.participant1_id);
          const participant2User = profileMap.get(dm.participant2_id);
          const userIsParticipant = dm.participant1_id === user?.id || dm.participant2_id === user?.id;
          const otherUser = dm.participant1_id === user?.id ? participant2User : dm.participant2_id === user?.id ? participant1User : participant2User;

          return {
            ...dm,
            other_user: otherUser,
            participant1_user: participant1User,
            participant2_user: participant2User,
            display_name: userIsParticipant
              ? (otherUser?.full_name || "Unknown")
              : `${participant1User?.full_name || "Unknown"} ↔ ${participant2User?.full_name || "Unknown"}`,
            display_avatar_url: userIsParticipant ? otherUser?.avatar_url : undefined,
          };
        }));
      } else {
        setDirectMessages([]);
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCreators() {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, email")
      .order("full_name");

    const { data: creatorRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "creator");

    const creatorUserIds = new Set(creatorRoles?.map(r => r.user_id) || []);
    const creatorProfiles = data?.filter(p => creatorUserIds.has(p.user_id)) || [];

    setCreators(creatorProfiles);
  }

  async function fetchScheduledMessages() {
    const { data } = await supabase
      .from("scheduled_messages" as any)
      .select("*")
      .eq("sent", false)
      .order("scheduled_at", { ascending: true });
    setScheduledMessages((data as unknown as ScheduledMessage[]) || []);
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

      const reactionsByMessage: Record<string, { emoji: string; user_id: string }[]> = {};
      for (const r of reactionsRes.data || []) {
        if (!reactionsByMessage[r.message_id]) reactionsByMessage[r.message_id] = [];
        reactionsByMessage[r.message_id].push(r);
      }

      const messagesWithSenders = messagesData.map((m) => ({
        ...m,
        sender: m.sender_id ? profileMap.get(m.sender_id) : null,
        reactions: buildReactions(reactionsByMessage[m.id] || [], user?.id || ""),
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
    if (!selectedChat) return;
    const messageIds = messages.map((m) => m.id);
    if (messageIds.length === 0) return;
    const { data } = await supabase
      .from("message_reactions")
      .select("message_id, emoji, user_id")
      .in("message_id", messageIds);

    const reactionsByMessage: Record<string, { emoji: string; user_id: string }[]> = {};
    for (const r of data || []) {
      if (!reactionsByMessage[r.message_id]) reactionsByMessage[r.message_id] = [];
      reactionsByMessage[r.message_id].push(r);
    }

    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        reactions: buildReactions(reactionsByMessage[m.id] || [], user?.id || ""),
      }))
    );
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!user) return;
    const message = messages.find((m) => m.id === messageId);
    const existing = message?.reactions?.find((r) => r.emoji === emoji && r.reacted);
    if (existing) {
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
    } else {
      await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji });
    }
    // Immediately refresh so the clicker sees the change without waiting for realtime
    await fetchReactions();
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingIcon(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `group-icons/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("chat-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
      setNewChatIconUrl(data.publicUrl);
    } catch {
      toast.error("Failed to upload icon");
    } finally {
      setUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = "";
    }
  }

  async function handleEditIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !editingIconChatId) return;
    setUploadingIcon(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `group-icons/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("chat-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("group_chats")
        .update({ icon_url: data.publicUrl } as any)
        .eq("id", editingIconChatId);
      if (updateError) throw updateError;
      // Update local state
      setGroupChats((prev) =>
        prev.map((g) => g.id === editingIconChatId ? { ...g, icon_url: data.publicUrl } : g)
      );
      toast.success("Group icon updated!");
    } catch {
      toast.error("Failed to update icon");
    } finally {
      setUploadingIcon(false);
      setEditingIconChatId(null);
      if (editIconInputRef.current) editIconInputRef.current.value = "";
    }
  }

  async function createGroupChat(e: React.FormEvent) {
    e.preventDefault();
    if (!newChatName.trim() || selectedCreators.length === 0) {
      toast.error("Please enter a name and select at least one creator");
      return;
    }

    try {
      const { data: chat, error: chatError } = await supabase
        .from("group_chats")
        .insert({
          name: newChatName,
          description: newChatDescription || null,
          created_by: user?.id,
          chat_type: "group",
          icon_url: newChatIconUrl || null,
        } as any)
        .select()
        .single();

      if (chatError) throw chatError;

      const members = [{ chat_id: chat.id, user_id: user?.id }];
      
      for (const creatorId of selectedCreators) {
        const creator = creators.find(c => c.id === creatorId);
        if (creator) {
          members.push({ chat_id: chat.id, user_id: creator.user_id });
        }
      }

      await supabase.from("group_chat_members").insert(members);

      toast.success("Group chat created successfully");
      setDialogOpen(false);
      setNewChatName("");
      setNewChatDescription("");
      setNewChatIconUrl(null);
      setSelectedCreators([]);
      setSelectAll(false);
      fetchChats();
    } catch (error) {
      console.error("Error creating chat:", error);
      toast.error("Failed to create chat");
    }
  }

  async function createDM(creatorUserId: string, creatorName: string) {
    try {
      const { data: existing } = await supabase
        .from("direct_messages")
        .select("id")
        .or(`and(participant1_id.eq.${user?.id},participant2_id.eq.${creatorUserId}),and(participant1_id.eq.${creatorUserId},participant2_id.eq.${user?.id})`)
        .maybeSingle();

      if (existing) {
        setSelectedChat({ type: "dm", id: existing.id, name: creatorName });
        setActiveTab("dms");
        setDmDialogOpen(false);
        return;
      }

      const { data: dm, error } = await supabase
        .from("direct_messages")
        .insert({
          participant1_id: user?.id,
          participant2_id: creatorUserId,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Started conversation with ${creatorName}`);
      setDmDialogOpen(false);
      await fetchChats();
      setSelectedChat({ type: "dm", id: dm.id, name: creatorName });
      setActiveTab("dms");
    } catch (error) {
      console.error("Error creating DM:", error);
      toast.error("Failed to start conversation");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingMedia) || !selectedChat || !user) return;

    // If a schedule is set, save as scheduled message
    if (scheduledDate) {
      const [h, m] = scheduleTime.split(":").map(Number);
      const scheduledAt = new Date(scheduledDate);
      scheduledAt.setHours(h, m, 0, 0);

      const payload: any = {
        sender_id: user.id,
        content: newMessage.trim() || (pendingMedia ? (pendingMedia.type === "image" ? "📷 Photo" : pendingMedia.type === "audio" ? "🎤 Voice note" : "🎥 Video") : ""),
        scheduled_at: scheduledAt.toISOString(),
      };

      if (pendingMedia?.type === "image") payload.image_url = pendingMedia.url;
      if (selectedChat.type === "dm") payload.dm_id = selectedChat.id;
      else payload.chat_id = selectedChat.id;

      const { error } = await supabase.from("scheduled_messages" as any).insert(payload);
      if (error) {
        toast.error("Failed to schedule message");
        console.error(error);
        return;
      }

      toast.success(`Message scheduled for ${format(scheduledAt, "MMM d 'at' h:mm a")}`);
      setNewMessage("");
      setPendingMedia(null);
      setScheduledDate(undefined);
      setScheduleTime("09:00");
      setSchedulePopoverOpen(false);
      fetchScheduledMessages();
      return;
    }

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
      sender: { full_name: adminName, avatar_url: profileCacheRef.current.get(user.id)?.avatar_url || null },
      reactions: [],
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    const savedReplyTo = replyTo;
    setNewMessage("");
    setPendingMedia(null);
    setReplyTo(null);

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

      const { data: insertedMsg, error } = await supabase
        .from("messages")
        .insert(messageData)
        .select("id")
        .single();

      if (error) throw error;

      // Fire-and-forget: notify chat members by email
      if (insertedMsg) {
        supabase.functions.invoke("notify-chat-message", {
          body: {
            message_id: insertedMsg.id,
            sender_id: user.id,
            chat_id: selectedChat.type === "group" ? selectedChat.id : undefined,
            dm_id: selectedChat.type === "dm" ? selectedChat.id : undefined,
            content,
            chat_name: selectedChat.name,
          },
        }).catch(() => {/* ignore notification errors */});
      }
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

      const { data: insertedMsg, error } = await supabase
        .from("messages")
        .insert(messageData)
        .select()
        .single();
      if (error) throw error;
      setReplyTo(null);

      if (insertedMsg) {
        supabase.functions.invoke("notify-chat-message", {
          body: {
            message_id: insertedMsg.id,
            sender_id: user.id,
            chat_id: selectedChat.type === "group" ? selectedChat.id : undefined,
            dm_id: selectedChat.type === "dm" ? selectedChat.id : undefined,
            content: "Sent a sticker",
          },
        }).catch(() => {});
      }
    } catch (error) {
      console.error("Error sending sticker:", error);
      toast.error("Failed to send sticker");
    }
  }

  async function deleteMessage(messageId: string) {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) {
      toast.error("Failed to delete message");
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  async function cancelScheduledMessage(id: string) {
    const { error } = await supabase.from("scheduled_messages" as any).delete().eq("id", id);
    if (error) {
      toast.error("Failed to cancel scheduled message");
      return;
    }
    toast.success("Scheduled message cancelled");
    fetchScheduledMessages();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const result = await uploadMedia(file, user.id);
    if (result) {
      if (result.imageUrl) {
        setPendingMedia({ url: result.imageUrl, type: "image" });
      } else if (result.videoUrl) {
        setPendingMedia({ url: result.videoUrl, type: "video" });
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setSelectedCreators(checked ? creators.map(c => c.id) : []);
  };

  const handleCreatorSelect = (creatorId: string, checked: boolean) => {
    if (checked) {
      setSelectedCreators([...selectedCreators, creatorId]);
    } else {
      setSelectedCreators(selectedCreators.filter(id => id !== creatorId));
      setSelectAll(false);
    }
  };

  async function fetchGroupMembers(chatId: string) {
    setLoadingMembers(true);
    try {
      const { data: memberRows } = await supabase
        .from("group_chat_members")
        .select("id, user_id")
        .eq("chat_id", chatId);

      if (!memberRows?.length) {
        setCurrentMembers([]);
        setLoadingMembers(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", memberRows.map(m => m.user_id));

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      setCurrentMembers(
        memberRows.map(m => ({
          user_id: m.user_id,
          full_name: profileMap.get(m.user_id)?.full_name || "Unknown",
          avatar_url: profileMap.get(m.user_id)?.avatar_url,
          member_row_id: m.id,
        }))
      );
    } catch (err) {
      console.error("Error fetching group members:", err);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function addMembersToGroup(chatId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    try {
      const rows = userIds.map(uid => ({ chat_id: chatId, user_id: uid }));
      const { error } = await supabase.from("group_chat_members").insert(rows);
      if (error) throw error;
      toast.success(`Added ${userIds.length} member(s)`);
      setMembersToAdd([]);
      fetchGroupMembers(chatId);
      fetchChats();
    } catch (err) {
      console.error("Error adding members:", err);
      toast.error("Failed to add members");
    }
  }

  async function removeMemberFromGroup(memberRowId: string, chatId: string) {
    try {
      const { error } = await supabase.from("group_chat_members").delete().eq("id", memberRowId);
      if (error) throw error;
      toast.success("Member removed");
      fetchGroupMembers(chatId);
      fetchChats();
    } catch (err) {
      console.error("Error removing member:", err);
      toast.error("Failed to remove member");
    }
  }

  async function handleManageMembersIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedChat) return;
    setUploadingIcon(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `group-icons/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("chat-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("group_chats")
        .update({ icon_url: data.publicUrl } as any)
        .eq("id", selectedChat.id);
      if (updateError) throw updateError;
      setGroupChats(prev => prev.map(g => g.id === selectedChat.id ? { ...g, icon_url: data.publicUrl } : g));
      toast.success("Group icon updated!");
    } catch {
      toast.error("Failed to update icon");
    } finally {
      setUploadingIcon(false);
      if (manageMembersIconRef.current) manageMembersIconRef.current.value = "";
    }
  }

  function openManageMembers() {
    if (!selectedChat || selectedChat.type !== "group") return;
    setMembersToAdd([]);
    fetchGroupMembers(selectedChat.id);
    setManageMembersOpen(true);
  }

  const addableCreators = creators.filter(
    c => !currentMembers.some(m => m.user_id === c.user_id)
  );

  const pendingScheduledForChat = scheduledMessages.filter(m =>
    selectedChat
      ? (selectedChat.type === "dm" ? m.dm_id === selectedChat.id : m.chat_id === selectedChat.id)
      : false
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="h-[calc(100vh-12rem)] bg-muted/50 rounded-xl animate-pulse" />
      </AdminLayout>
    );
  }

  // Mobile: show chat list or conversation, not both
  const showMobileChatView = selectedChat !== null;

  const chatListContent = (
    <Card className="h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "dms" | "groups")}>
        <CardHeader className="pb-2">
          <TabsList className="w-full">
            <TabsTrigger value="groups" className="flex-1">
              <Users className="w-4 h-4 mr-1" />
              Groups
            </TabsTrigger>
            <TabsTrigger value="dms" className="flex-1">
              <User className="w-4 h-4 mr-1" />
              DMs
            </TabsTrigger>
          </TabsList>
          {scheduledMessages.length > 0 && (
            <button
              onClick={() => setShowScheduled(!showScheduled)}
              className="mt-2 w-full flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 text-amber-600 text-xs font-medium hover:bg-amber-500/20 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {scheduledMessages.length} scheduled
              </span>
              <span>{showScheduled ? "Hide" : "View"}</span>
            </button>
          )}
        </CardHeader>

        {showScheduled ? (
          <CardContent className="p-2">
            <ScrollArea className="h-[calc(100vh-22rem)] lg:h-[calc(100vh-26rem)]">
              <div className="space-y-2">
                {scheduledMessages.map((msg) => (
                  <div key={msg.id} className="p-3 rounded-lg border bg-muted/30 text-xs space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 flex-1 text-foreground">{msg.content}</p>
                      <button
                        onClick={() => cancelScheduledMessage(msg.id)}
                        className="text-destructive hover:text-destructive/80 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-muted-foreground">
                      📅 {format(new Date(msg.scheduled_at), "MMM d 'at' h:mm a")}
                    </p>
                    <p className="text-muted-foreground">
                      → {msg.chat_id
                        ? groupChats.find(g => g.id === msg.chat_id)?.name || "Group"
                        : directMessages.find(d => d.id === msg.dm_id)?.other_user?.full_name || "DM"}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <TabsContent value="groups" className="m-0">
              <ScrollArea className="h-[calc(100vh-20rem)] lg:h-[calc(100vh-24rem)]">
                {groupChats.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 px-4">
                    No group chats yet. Create one to get started.
                  </p>
                ) : (
                  <div className="space-y-1 p-2">
                    {groupChats.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => setSelectedChat({ type: "group", id: chat.id, name: chat.name })}
                        className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                          selectedChat?.id === chat.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        {(chat as any).icon_url ? (
                          <img src={(chat as any).icon_url} alt={chat.name} className="w-8 h-8 rounded-full object-cover shrink-0 border" />
                        ) : (
                          <StackedAvatars members={chat.members || []} />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium truncate">{chat.name}</p>
                          {chat.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {chat.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="dms" className="m-0">
              <ScrollArea className="h-[calc(100vh-20rem)] lg:h-[calc(100vh-24rem)]">
                {directMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 px-4">
                    No conversations yet. Start a DM with a creator.
                  </p>
                ) : (
                  <div className="space-y-1 p-2">
                    {directMessages.map((dm) => (
                      <button
                        key={dm.id}
                        onClick={() => setSelectedChat({ 
                          type: "dm", 
                          id: dm.id, 
                          name: dm.display_name || dm.other_user?.full_name || "Unknown"
                        })}
                        className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                          selectedChat?.id === dm.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={dm.display_avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {(dm.display_name || dm.other_user?.full_name || "?")?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{dm.display_name || dm.other_user?.full_name || "Unknown"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </CardContent>
        )}
      </Tabs>
    </Card>
  );

  const chatMessagesContent = (
    <Card className="flex flex-col h-full">
      {selectedChat ? (
        <>
          <CardHeader className="border-b py-3">
            <div className="flex items-center gap-3">
              {/* Back button on mobile */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden shrink-0"
                onClick={() => setSelectedChat(null)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              {selectedChat.type === "dm" ? (
                (() => {
                  const activeDm = directMessages.find(d => d.id === selectedChat.id);
                  return (
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={activeDm?.display_avatar_url || undefined} />
                      <AvatarFallback>{selectedChat.name[0]}</AvatarFallback>
                    </Avatar>
                  );
                })()
              ) : (
                (() => {
                  const activeGroup = groupChats.find(g => g.id === selectedChat.id);
                  return (
                    <div className="relative group/icon shrink-0">
                      {(activeGroup as any)?.icon_url ? (
                        <img src={(activeGroup as any).icon_url} alt={activeGroup!.name} className="w-10 h-10 rounded-full object-cover border" />
                      ) : activeGroup?.members?.length ? (
                        <StackedAvatars members={activeGroup.members} />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                          <Hash className="w-5 h-5" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => { setEditingIconChatId(selectedChat.id); editIconInputRef.current?.click(); }}
                        className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/icon:opacity-100 transition-opacity"
                        title="Change group icon"
                      >
                        {uploadingIcon && editingIconChatId === selectedChat.id ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>
                  );
                })()
              )}
              {/* Hidden input for editing existing group icon */}
              <input type="file" ref={editIconInputRef} onChange={handleEditIconUpload} accept="image/*" className="hidden" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg">{selectedChat.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedChat.type === "dm" ? "Direct Message" : "Group Chat"}
                </p>
              </div>
              {selectedChat.type === "group" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openManageMembers}
                  title="Manage members"
                  className="shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
              )}
              {pendingScheduledForChat.length > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-500/40 bg-amber-500/10 shrink-0">
                  <Clock className="w-3 h-3 mr-1" />
                  {pendingScheduledForChat.length} scheduled
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={messagesScrollRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No messages yet</p>
                  <p className="text-sm text-muted-foreground">Be the first to send a message!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => {
                    const isOwn = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex gap-2 group ${isOwn ? "flex-row-reverse" : ""}`}
                        onMouseEnter={() => setHoveredMessageId(message.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        {/* Avatar */}
                        <Avatar className="w-8 h-8 shrink-0 mt-1">
                          <AvatarImage src={(message.sender as any)?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {(message.sender as any)?.full_name?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>

                        <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
                          {/* Bubble */}
                          <div
                            className={`rounded-2xl overflow-hidden break-words ${
                              isOwn
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted rounded-tl-sm"
                            } ${message.image_url || message.video_url || message.audio_url ? "p-1" : "p-3"}`}
                            style={{ overflowWrap: "break-word", wordBreak: "break-word", maxWidth: "100%" }}
                          >
                            {/* Reply quote */}
                            {message.reply_to && (
                              <div className={`border-l-2 border-primary/50 bg-primary/5 rounded px-2 py-1 mb-1 ${message.image_url || message.video_url || message.audio_url ? "mx-1 mt-1" : ""}`}>
                                <p className="text-[10px] font-semibold text-primary/70">{message.reply_to.sender_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{message.reply_to.content === "🏷️ Sticker" ? "Sticker" : message.reply_to.content}</p>
                              </div>
                            )}
                            {!isOwn && (
                              <p className={`text-xs font-semibold mb-1 opacity-70 ${message.image_url || message.video_url || message.audio_url ? "px-2 pt-2" : ""}`}>
                                {(message.sender as any)?.full_name || "Unknown"}
                              </p>
                            )}
                            {message.image_url && message.content === "🏷️ Sticker" ? (
                              <img
                                src={message.image_url}
                                alt="Sticker"
                                className="w-32 h-32 object-contain"
                                loading="lazy"
                              />
                            ) : message.image_url ? (
                              <img
                                src={message.image_url}
                                alt="Shared image"
                                className="max-w-full md:max-w-md lg:max-w-lg rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
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
                                className="max-w-full md:max-w-md lg:max-w-lg rounded-xl"
                              />
                            )}
                            {(message as any).audio_url && (
                              <div className={`px-2 py-1 ${message.image_url || message.video_url ? "" : ""}`}>
                                <AudioBubble src={(message as any).audio_url} isOwn={isOwn} />
                              </div>
                            )}
                            {message.content && !message.content.startsWith("📷") && !message.content.startsWith("🎥") && !message.content.startsWith("🎤") && message.content !== "🏷️ Sticker" && (
                              <ChatMessageContent content={message.content} className={message.image_url || message.video_url || (message as any).audio_url ? "px-2" : ""} />
                            )}
                            <p className={`text-xs opacity-60 mt-1 ${message.image_url || message.video_url || (message as any).audio_url ? "px-2 pb-2" : ""}`}>
                              {format(new Date(message.created_at), "h:mm a")}
                            </p>
                          </div>

                          {/* Reactions display */}
                          {(message.reactions || []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(message.reactions || []).map((r) => (
                                <button
                                  key={r.emoji}
                                  onClick={() => toggleReaction(message.id, r.emoji)}
                                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                    r.reacted
                                      ? "bg-primary/10 border-primary/30 text-primary"
                                      : "bg-muted border-border hover:bg-muted/80"
                                  }`}
                                >
                                  {r.emoji} <span>{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Hover reaction bar */}
                          {hoveredMessageId === message.id && (
                            <div className={`flex items-center gap-1 bg-popover border rounded-full px-2 py-1 shadow-md ${isOwn ? "flex-row-reverse" : ""}`}>
                              {QUICK_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(message.id, emoji)}
                                  className="text-base hover:scale-125 transition-transform"
                                >
                                  {emoji}
                                </button>
                              ))}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="text-muted-foreground hover:text-foreground transition-colors px-1">
                                    <Smile className="w-4 h-4" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" align={isOwn ? "end" : "start"}>
                                  <div className="grid grid-cols-5 gap-1">
                                    {EMOJI_GRID.map((emoji) => (
                                      <button
                                        key={emoji}
                                        onClick={() => toggleReaction(message.id, emoji)}
                                        className="text-xl hover:scale-125 transition-transform p-1 rounded hover:bg-muted"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {/* Reply */}
                              <button
                                onClick={() => setReplyTo({ id: message.id, content: message.content, senderName: (message.sender as any)?.full_name || "Unknown" })}
                                className="text-muted-foreground hover:text-foreground transition-colors border-l pl-1"
                                title="Reply"
                              >
                                <Reply className="w-4 h-4" />
                              </button>
                              {/* Delete — admins can delete any message, others only their own */}
                              <button
                                onClick={() => deleteMessage(message.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors border-l pl-1"
                                title="Delete message"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={messagesEndRef} />
            </ScrollArea>
            <form onSubmit={sendMessage} className="p-4 border-t">
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
              {/* Schedule indicator */}
              {scheduledDate && (
                <div className="mb-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Scheduling for {format(scheduledDate, "MMM d")} at {scheduleTime}</span>
                  <button
                    type="button"
                    onClick={() => { setScheduledDate(undefined); setScheduleTime("09:00"); }}
                    className="ml-auto hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {pendingMedia && (
                <div className="mb-3 relative inline-block">
                  {pendingMedia.type === "image" ? (
                    <img 
                      src={pendingMedia.url} 
                      alt="Pending upload" 
                      className="h-20 rounded-lg"
                    />
                  ) : pendingMedia.type === "audio" ? (
                    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                      <AudioBubble src={pendingMedia.url} isOwn={false} />
                    </div>
                  ) : (
                    <video 
                      src={pendingMedia.url} 
                      className="h-20 rounded-lg"
                    />
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
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,video/*"
                  className="hidden"
                />
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ImageIcon className="w-5 h-5" />
                  )}
                </Button>
                <QuickReplyPopover onSelect={(content) => setNewMessage(content)} />
                <StickerPicker onSelect={sendSticker} disabled={uploading} />
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (newMessage.trim() || pendingMedia) {
                        (e.target as HTMLTextAreaElement).form?.requestSubmit();
                      }
                    }
                  }}
                  placeholder="Type a message… (Shift+Enter for new line)"
                  className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                  rows={1}
                />
                <VoiceRecorder
                  userId={user?.id || ""}
                  onRecorded={(url) => setPendingMedia({ url, type: "audio" })}
                  disabled={uploading || !!pendingMedia}
                />
                {/* Schedule clock button */}
                <Popover open={schedulePopoverOpen} onOpenChange={setSchedulePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(scheduledDate && "text-amber-600")}
                    >
                      <Clock className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4" align="end">
                    <p className="text-sm font-medium mb-3">Schedule message</p>
                    <Calendar
                      mode="single"
                      selected={scheduledDate}
                      onSelect={setScheduledDate}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                      initialFocus
                      className="p-0 pointer-events-auto"
                    />
                    <div className="mt-3 space-y-2">
                      <label className="text-xs text-muted-foreground">Time</label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => setSchedulePopoverOpen(false)}
                      disabled={!scheduledDate}
                    >
                      Set Schedule
                    </Button>
                    {scheduledDate && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full mt-1 text-muted-foreground"
                        onClick={() => { setScheduledDate(undefined); setScheduleTime("09:00"); setSchedulePopoverOpen(false); }}
                      >
                        Clear
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
                <Button
                  type="submit"
                  size={scheduledDate ? "sm" : "icon"}
                  disabled={(!newMessage.trim() && !pendingMedia) || uploading}
                  className={scheduledDate ? "bg-amber-500 hover:bg-amber-600 text-white gap-1.5" : ""}
                >
                  {scheduledDate ? (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      Schedule
                    </>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </>
      ) : (
        <CardContent className="flex flex-col items-center justify-center h-full">
          <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Select a chat to start messaging</p>
        </CardContent>
      )}
    </Card>
  );

  return (
    <AdminLayout>
      <div className="space-y-4 lg:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Chat</h1>
            <p className="text-sm text-muted-foreground">Communicate with creators</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={dmDialogOpen} onOpenChange={setDmDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <User className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden sm:inline">New DM</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start Direct Message</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-80">
                  <div className="space-y-2">
                    {creators.map((creator) => (
                      <button
                        key={creator.id}
                        onClick={() => createDM(creator.user_id, creator.full_name)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarFallback>{creator.full_name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{creator.full_name}</p>
                          <p className="text-sm text-muted-foreground">{creator.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden sm:inline">New Group</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Group Chat</DialogTitle>
                </DialogHeader>
                 <form onSubmit={createGroupChat} className="space-y-4">
                   {/* Group Icon Upload */}
                   <div className="flex items-center gap-4">
                     <div className="relative w-16 h-16 shrink-0">
                       {newChatIconUrl ? (
                         <img src={newChatIconUrl} alt="Group icon" className="w-16 h-16 rounded-full object-cover border" />
                       ) : (
                         <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center border-2 border-dashed border-border">
                           <Hash className="w-7 h-7 text-muted-foreground" />
                         </div>
                       )}
                       <button
                         type="button"
                         onClick={() => iconInputRef.current?.click()}
                         className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow"
                         disabled={uploadingIcon}
                       >
                         {uploadingIcon ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                       </button>
                       <input type="file" ref={iconInputRef} onChange={handleIconUpload} accept="image/*" className="hidden" />
                     </div>
                     <div className="flex-1">
                       <p className="text-sm font-medium">Group Icon</p>
                       <p className="text-xs text-muted-foreground">Upload a photo for this group</p>
                     </div>
                   </div>
                   <div>
                     <label className="text-sm font-medium">Chat Name</label>
                    <Input
                      value={newChatName}
                      onChange={(e) => setNewChatName(e.target.value)}
                      placeholder="e.g., General Announcements"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description (optional)</label>
                    <Input
                      value={newChatDescription}
                      onChange={(e) => setNewChatDescription(e.target.value)}
                      placeholder="What's this chat about?"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Select Creators</label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="select-all"
                          checked={selectAll}
                          onCheckedChange={handleSelectAll}
                        />
                        <label htmlFor="select-all" className="text-sm">Select All</label>
                      </div>
                    </div>
                    <ScrollArea className="h-48 border rounded-lg p-2">
                      {creators.map((creator) => (
                        <div key={creator.id} className="flex items-center gap-2 py-2">
                          <Checkbox
                            id={creator.id}
                            checked={selectedCreators.includes(creator.id)}
                            onCheckedChange={(checked) => handleCreatorSelect(creator.id, checked as boolean)}
                          />
                          <label htmlFor={creator.id} className="text-sm flex-1 cursor-pointer">
                            {creator.full_name}
                          </label>
                        </div>
                      ))}
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedCreators.length} creator(s) selected
                    </p>
                  </div>
                  <Button type="submit" className="w-full">Create Group</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Manage Members Dialog */}
        <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Members</DialogTitle>
            </DialogHeader>

            {/* Group icon edit in dialog */}
            {selectedChat?.type === "group" && (
              <div className="flex items-center gap-4 pb-2 border-b">
                <div className="relative w-14 h-14 shrink-0">
                  {(() => {
                    const activeGroup = groupChats.find(g => g.id === selectedChat.id);
                    return (activeGroup as any)?.icon_url ? (
                      <img src={(activeGroup as any).icon_url} alt="Group" className="w-14 h-14 rounded-full object-cover border" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center border-2 border-dashed border-border">
                        <Hash className="w-6 h-6 text-muted-foreground" />
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => manageMembersIconRef.current?.click()}
                    className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow"
                    disabled={uploadingIcon}
                  >
                    {uploadingIcon ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                  </button>
                  <input type="file" ref={manageMembersIconRef} onChange={handleManageMembersIconUpload} accept="image/*" className="hidden" />
                </div>
                <div>
                  <p className="font-medium">{selectedChat.name}</p>
                  <p className="text-xs text-muted-foreground">Tap camera to change icon</p>
                </div>
              </div>
            )}

            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Current Members */}
                <div>
                  <p className="text-sm font-medium mb-2">Current Members ({currentMembers.length})</p>
                  <ScrollArea className="max-h-40">
                    <div className="space-y-1">
                      {currentMembers.map(member => (
                        <div key={member.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={member.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">{member.full_name?.[0] || "?"}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm flex-1 truncate">{member.full_name}</span>
                          {member.user_id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeMemberFromGroup(member.member_row_id, selectedChat!.id)}
                              title="Remove member"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Add Members */}
                {addableCreators.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Add Members</p>
                    <ScrollArea className="max-h-40 border rounded-lg p-2">
                      {addableCreators.map(creator => (
                        <div key={creator.id} className="flex items-center gap-2 py-2">
                          <Checkbox
                            id={`add-${creator.id}`}
                            checked={membersToAdd.includes(creator.user_id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setMembersToAdd(prev => [...prev, creator.user_id]);
                              } else {
                                setMembersToAdd(prev => prev.filter(id => id !== creator.user_id));
                              }
                            }}
                          />
                          <label htmlFor={`add-${creator.id}`} className="text-sm flex-1 cursor-pointer">
                            {creator.full_name}
                          </label>
                        </div>
                      ))}
                    </ScrollArea>
                    <Button
                      className="w-full mt-3"
                      size="sm"
                      disabled={membersToAdd.length === 0}
                      onClick={() => addMembersToGroup(selectedChat!.id, membersToAdd)}
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      Add {membersToAdd.length} Member{membersToAdd.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                )}

                {addableCreators.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">All creators are already in this group.</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Desktop: side by side. Mobile: toggle between list and conversation */}
        <div className="lg:grid lg:grid-cols-4 lg:gap-6 h-[calc(100vh-14rem)] lg:h-[calc(100vh-16rem)]">
          {/* Chat list - hidden on mobile when a chat is selected */}
          <div className={`lg:col-span-1 h-full ${showMobileChatView ? 'hidden lg:block' : 'block'}`}>
            {chatListContent}
          </div>
          
          {/* Chat messages - hidden on mobile when no chat is selected */}
          <div className={`lg:col-span-3 h-full ${showMobileChatView ? 'block' : 'hidden lg:block'}`}>
            {chatMessagesContent}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
