import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface OnlineUser {
  id: string;
  name: string;
  lastSeen: Date;
}

export function useOnlinePresence(userId: string | undefined, userName: string = "User") {
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("online-presence", {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users = new Map<string, OnlineUser>();
        
        Object.entries(state).forEach(([key, presences]: [string, any[]]) => {
          if (presences.length > 0) {
            const presence = presences[0];
            users.set(key, {
              id: key,
              name: presence.userName || "Unknown",
              lastSeen: new Date(presence.online_at),
            });
          }
        });
        
        setOnlineUsers(users);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (newPresences.length > 0) {
          const presence = newPresences[0];
          setOnlineUsers((prev) => {
            const updated = new Map(prev);
            updated.set(key, {
              id: key,
              name: presence.userName || "Unknown",
              lastSeen: new Date(presence.online_at),
            });
            return updated;
          });
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        setOnlineUsers((prev) => {
          const updated = new Map(prev);
          updated.delete(key);
          return updated;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId,
            userName,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [userId, userName]);

  const isUserOnline = (checkUserId: string): boolean => {
    return onlineUsers.has(checkUserId);
  };

  return {
    onlineUsers,
    isUserOnline,
    onlineCount: onlineUsers.size,
  };
}