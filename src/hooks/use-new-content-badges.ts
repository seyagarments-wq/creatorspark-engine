import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type BadgeSection = "learn" | "briefs" | "rewards" | "samples";

interface BadgeCounts {
  learn: number;
  briefs: number;
  rewards: number;
  samples: number;
}

const SECTION_KEYS: BadgeSection[] = ["learn", "briefs", "rewards", "samples"];

function storageKey(section: BadgeSection, userId: string) {
  return `last_seen_${section}_${userId}`;
}

export function useNewContentBadges() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<BadgeCounts>({
    learn: 0,
    briefs: 0,
    rewards: 0,
    samples: 0,
  });

  const fetchBadges = useCallback(async () => {
    if (!user) return;

    const lastSeenDates: Record<BadgeSection, string | null> = {
      learn: localStorage.getItem(storageKey("learn", user.id)),
      briefs: localStorage.getItem(storageKey("briefs", user.id)),
      rewards: localStorage.getItem(storageKey("rewards", user.id)),
      samples: localStorage.getItem(storageKey("samples", user.id)),
    };

    // Build count queries with filters
    const learnQuery = lastSeenDates.learn
      ? supabase.from("resources").select("id", { count: "exact", head: true }).eq("is_published", true).gt("created_at", lastSeenDates.learn)
      : supabase.from("resources").select("id", { count: "exact", head: true }).eq("is_published", true);

    const briefsQuery = lastSeenDates.briefs
      ? supabase.from("creative_briefs").select("id", { count: "exact", head: true }).eq("is_active", true).gt("created_at", lastSeenDates.briefs)
      : supabase.from("creative_briefs").select("id", { count: "exact", head: true }).eq("is_active", true);

    const rewardsQuery = lastSeenDates.rewards
      ? supabase.from("bounties").select("id", { count: "exact", head: true }).gt("created_at", lastSeenDates.rewards)
      : supabase.from("bounties").select("id", { count: "exact", head: true });

    // Fetch profile + all badge counts in one parallel batch
    const [profileRes, learnRes, briefsRes, rewardsRes] = await Promise.all([
      supabase.from("profiles").select("id").eq("user_id", user.id).single(),
      learnQuery,
      briefsQuery,
      rewardsQuery,
    ]);

    const profile = profileRes.data;
    const samplesRes = profile
      ? await (lastSeenDates.samples
          ? supabase.from("sample_requests").select("id", { count: "exact", head: true }).eq("creator_id", profile.id).gt("updated_at", lastSeenDates.samples)
          : supabase.from("sample_requests").select("id", { count: "exact", head: true }).eq("creator_id", profile.id))
      : { count: 0 };

    const cap = (n: number | null) => Math.min(n ?? 0, 99);

    setBadges({
      learn: cap(learnRes.count),
      briefs: cap(briefsRes.count),
      rewards: cap(rewardsRes.count),
      samples: cap(samplesRes.count),
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchBadges();

    const channel = supabase
      .channel(`new-content-badges-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "resources" }, () => fetchBadges())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "creative_briefs" }, () => fetchBadges())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bounties" }, () => fetchBadges())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sample_requests" }, () => fetchBadges())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchBadges]);

  const markSeen = useCallback(
    (section: BadgeSection) => {
      if (!user) return;
      localStorage.setItem(storageKey(section, user.id), new Date().toISOString());
      setBadges((prev) => ({ ...prev, [section]: 0 }));
    },
    [user]
  );

  return { badges, markSeen };
}
