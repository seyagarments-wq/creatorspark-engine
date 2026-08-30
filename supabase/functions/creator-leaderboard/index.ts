import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MetricType = "earnings" | "streak" | "videos" | "referrals" | "revenue";

interface LeaderboardRequest {
  metric?: MetricType;
  limit?: number;
}

interface CreatorProfile {
  id: string; // profile id
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  commission_percentage: number | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Fetches all rows for a query with PostgREST pagination.
 * NOTE: Supabase has a 1000 row default limit per request.
 */
async function fetchAll<T>(
  // PostgrestFilterBuilder is PromiseLike (thenable) but not a full Promise.
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Validate JWT
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return json({ error: "Authentication error: Invalid token" }, 401);
    }

    const { metric = "earnings", limit = 50 }: LeaderboardRequest =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 1) Resolve all creator user IDs
    const creatorRoles = await fetchAll<{ user_id: string }>((from, to) =>
      supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "creator")
        .range(from, to),
    );

    const creatorUserIds = Array.from(new Set(creatorRoles.map((r) => r.user_id)));
    if (creatorUserIds.length === 0) return json({ entries: [] });

    // 2) Profiles for those creators
    const profiles = await fetchAll<CreatorProfile>((from, to) =>
      supabaseAdmin
        .from("profiles")
        .select("id, user_id, full_name, avatar_url, commission_percentage")
        .in("user_id", creatorUserIds)
        .range(from, to),
    );

    // Ensure deterministic order (in case pagination order differs)
    const creatorProfiles = profiles
      .filter((p) => p?.id)
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    const profileIds = creatorProfiles.map((p) => p.id);

    // 3) Approved videos for those creators
    const videos = await fetchAll<{ id: string; creator_id: string }>((from, to) =>
      supabaseAdmin
        .from("videos")
        .select("id, creator_id")
        .eq("status", "approved")
        .in("creator_id", profileIds)
        .range(from, to),
    );

    const creatorVideoCount: Record<string, number> = {};
    const videoToCreator: Record<string, string> = {};
    const videoIds: string[] = [];
    for (const v of videos) {
      videoToCreator[v.id] = v.creator_id;
      creatorVideoCount[v.creator_id] = (creatorVideoCount[v.creator_id] || 0) + 1;
      videoIds.push(v.id);
    }

    // 4) Performance data (revenue + purchases) for those videos
    const creatorRevenue: Record<string, number> = {};
    const creatorPurchases: Record<string, number> = {};
    if (videoIds.length > 0) {
      // Chunk video IDs to keep request size reasonable
      for (const ids of chunk(videoIds, 200)) {
        const perfRows = await fetchAll<{ video_id: string; revenue: number | null; purchases: number | null }>(
          (from, to) =>
            supabaseAdmin
              .from("performance_data")
              .select("video_id, revenue, purchases")
              .in("video_id", ids)
              .range(from, to),
        );

        for (const row of perfRows) {
          const creatorId = videoToCreator[row.video_id];
          if (!creatorId) continue;
          creatorRevenue[creatorId] = (creatorRevenue[creatorId] || 0) + (row.revenue || 0);
          creatorPurchases[creatorId] = (creatorPurchases[creatorId] || 0) + (row.purchases || 0);
        }
      }
    }

    // 5) Bonus payouts (bounties/challenges)
    const creatorBonus: Record<string, number> = {};
    const payouts = await fetchAll<{ creator_id: string; amount: number }>((from, to) =>
      supabaseAdmin
        .from("payouts")
        .select("creator_id, amount")
        .in("creator_id", profileIds)
        .in("status", ["paid", "pending", "approved"])
        .in("payout_type", ["bounty", "challenge", "weekly_challenge"])
        .range(from, to),
    );
    for (const p of payouts) {
      creatorBonus[p.creator_id] = (creatorBonus[p.creator_id] || 0) + (p.amount || 0);
    }

    // 6) Gamification (level + streak)
    const creatorLevel: Record<string, number> = {};
    const creatorStreak: Record<string, number> = {};
    const gamification = await fetchAll<{ creator_id: string; current_level: number; current_streak: number }>(
      (from, to) =>
        supabaseAdmin
          .from("creator_gamification")
          .select("creator_id, current_level, current_streak")
          .in("creator_id", profileIds)
          .range(from, to),
    );
    for (const g of gamification) {
      creatorLevel[g.creator_id] = g.current_level ?? 1;
      creatorStreak[g.creator_id] = g.current_streak ?? 0;
    }

    // 7) Referral data (successful referrals count + bonus earned)
    const creatorReferralCount: Record<string, number> = {};
    const creatorReferralBonus: Record<string, number> = {};
    const referrals = await fetchAll<{ referrer_id: string }>(
      (from, to) =>
        supabaseAdmin
          .from("referrals")
          .select("referrer_id")
          .in("referrer_id", profileIds)
          .range(from, to),
    );
    for (const r of referrals) {
      creatorReferralCount[r.referrer_id] = (creatorReferralCount[r.referrer_id] || 0) + 1;
    }

    // Build output entries
    const entries = creatorProfiles.map((p) => {
      const approvedVideos = creatorVideoCount[p.id] || 0;
      const totalRevenue = creatorRevenue[p.id] || 0;
      const totalSales = creatorPurchases[p.id] || 0;
      const commissionRate = p.commission_percentage ?? 10;
      const commissionEarnings = totalRevenue * (commissionRate / 100);
      const bonusEarnings = creatorBonus[p.id] || 0;
      const totalEarnings = commissionEarnings + bonusEarnings;
      const currentStreak = creatorStreak[p.id] || 0;
      const level = creatorLevel[p.id] || 1;
      const referralCount = creatorReferralCount[p.id] || 0;
      const referralBonus = creatorReferralBonus[p.id] || 0;

      let tier = "Bronze";
      if (approvedVideos >= 50) tier = "Platinum";
      else if (approvedVideos >= 25) tier = "Gold";
      else if (approvedVideos >= 10) tier = "Silver";

      const metricValue =
        metric === "revenue"
          ? totalRevenue
          : metric === "earnings"
            ? commissionEarnings
            : metric === "videos"
              ? approvedVideos
              : metric === "referrals"
                ? referralCount
                : currentStreak;

      return {
        id: p.id,
        full_name: p.full_name || "Unknown Creator",
        avatar_url: p.avatar_url,
        tier,
        approvedVideos,
        totalRevenue,
        totalSales,
        currentStreak,
        totalEarnings,
        commissionEarnings,
        level,
        referralCount,
        referralBonus,
        metric_value: metricValue,
      };
    });

    // Rank creators for the chosen metric
    const isActiveForMetric = (e: any) => (e.metric_value || 0) > 0;
    const active = entries.filter(isActiveForMetric).sort((a, b) => (b.metric_value || 0) - (a.metric_value || 0));
    const inactive = entries.filter((e) => !isActiveForMetric(e)).sort((a, b) => a.full_name.localeCompare(b.full_name));
    const rankMap = new Map<string, number>();
    active.forEach((e, idx) => rankMap.set(e.id, idx + 1));

    const ordered = [...active, ...inactive]
      .slice(0, Math.max(1, Math.min(200, limit)))
      .map((e) => ({
        ...e,
        rank: rankMap.get(e.id) || 0,
      }));

    return json({ entries: ordered });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CREATOR-LEADERBOARD] ERROR", message);
    return json({ error: message }, 500);
  }
});
