import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    const lastReadKey = `chat_last_read_${user.id}`;
    const lastRead = localStorage.getItem(lastReadKey);
    const lastReadDate = lastRead ? new Date(lastRead) : new Date(0);

    // Single query: get DMs and count unread in parallel
    const { data: dms } = await supabase
      .from("direct_messages")
      .select("id")
      .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`);

    if (!dms || dms.length === 0) {
      setUnreadCount(0);
      return;
    }

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("dm_id", dms.map((d) => d.id))
      .neq("sender_id", user.id)
      .gt("created_at", lastReadDate.toISOString());

    setUnreadCount(count ?? 0);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchUnreadCount();

    // Subscribe to new messages
    const channel = supabase
      .channel(`unread-messages-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnreadCount]);

  const markAsRead = useCallback(() => {
    if (!user) return;
    const lastReadKey = `chat_last_read_${user.id}`;
    localStorage.setItem(lastReadKey, new Date().toISOString());
    setUnreadCount(0);
  }, [user]);

  return { unreadCount, markAsRead };
}
