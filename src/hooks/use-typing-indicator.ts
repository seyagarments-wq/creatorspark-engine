import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TypingUser {
  id: string;
  name: string;
}

export function useTypingIndicator(chatId: string | null, chatType: "dm" | "group", userId: string | undefined) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!chatId || !userId) return;

    const channelName = `typing-${chatType}-${chatId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: TypingUser[] = [];
        
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            if (presence.isTyping && presence.userId !== userId) {
              users.push({ id: presence.userId, name: presence.userName });
            }
          });
        });
        
        setTypingUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId,
            userName: "User",
            isTyping: false,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [chatId, chatType, userId]);

  const startTyping = useCallback(async (userName: string) => {
    if (!channelRef.current) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Update presence to show typing
    await channelRef.current.track({
      userId,
      userName,
      isTyping: true,
    });

    // Auto-stop typing after 3 seconds of inactivity
    timeoutRef.current = setTimeout(async () => {
      if (channelRef.current) {
        await channelRef.current.track({
          userId,
          userName,
          isTyping: false,
        });
      }
    }, 3000);
  }, [userId]);

  const stopTyping = useCallback(async (userName: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (channelRef.current) {
      await channelRef.current.track({
        userId,
        userName,
        isTyping: false,
      });
    }
  }, [userId]);

  return {
    typingUsers,
    startTyping,
    stopTyping,
  };
}