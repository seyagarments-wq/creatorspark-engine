import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileVideo,
  DollarSign,
  UserPlus,
  TrendingUp,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDistanceToNow } from "date-fns";

interface FeedEvent {
  id: string;
  type: "submission" | "approval" | "rejection" | "payout" | "creator_joined" | "revenue_milestone" | "ad_launch" | "ad_launch_failed";
  title: string;
  subtitle: string;
  timestamp: string;
  link: string;
}

export function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const debouncedFetch = useDebouncedCallback(() => fetchEvents(), 500);

  useEffect(() => {
    fetchEvents();

    const channel = supabase
      .channel("activity-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "videos" }, () => debouncedFetch())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payouts" }, () => debouncedFetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_launches" }, () => debouncedFetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchEvents() {
    try {
      // Fetch recent creator user_ids first so we can batch the profile lookup
      const creatorsPreRes = await supabase
        .from("user_roles")
        .select("user_id, created_at")
        .eq("role", "creator")
        .order("created_at", { ascending: false })
        .limit(5);

      const creatorUserIds = (creatorsPreRes.data || []).map((r) => r.user_id);

      // Now fetch everything in parallel (including creator profiles)
      const [videosRes, payoutsRes, launchesRes, creatorProfilesRes] = await Promise.all([
        supabase
          .from("videos")
          .select("id, title, created_at, status, profiles:creator_id(full_name)")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("payouts")
          .select("id, amount, status, paid_at, created_at, profiles:creator_id(full_name)")
          .eq("status", "paid")
          .order("paid_at", { ascending: false })
          .limit(5),
        supabase
          .from("ad_launches")
          .select("id, status, total_ads, ads_created, error_message, created_at, completed_at, updated_at")
          .in("status", ["processing", "completed", "failed"])
          .order("created_at", { ascending: false })
          .limit(10),
        creatorUserIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", creatorUserIds)
          : Promise.resolve({ data: [] }),
      ]);

      const feedEvents: FeedEvent[] = [];

      (videosRes.data || []).forEach((v: any) => {
        const eventType = v.status === "approved" ? "approval" : v.status === "rejected" ? "rejection" : "submission";
        feedEvents.push({
          id: `video-${v.id}`,
          type: eventType,
          title: v.status === "pending" ? `New submission: "${v.title}"` : v.status === "approved" ? `Approved: "${v.title}"` : `Rejected: "${v.title}"`,
          subtitle: `by ${v.profiles?.full_name || "Unknown"}`,
          timestamp: v.created_at,
          link: "/admin/submissions",
        });
      });

      (payoutsRes.data || []).forEach((p: any) => {
        feedEvents.push({
          id: `payout-${p.id}`,
          type: "payout",
          title: `$${Number(p.amount).toFixed(2)} paid`,
          subtitle: `to ${p.profiles?.full_name || "Unknown"}`,
          timestamp: p.paid_at || p.created_at,
          link: "/admin/payouts",
        });
      });

      if (creatorsPreRes.data) {
        const profileMap = new Map(
          (creatorProfilesRes.data || []).map((p: any) => [p.user_id, p.full_name])
        );
        creatorsPreRes.data.forEach((r) => {
          feedEvents.push({
            id: `creator-${r.user_id}`,
            type: "creator_joined",
            title: `${profileMap.get(r.user_id) || "New creator"} joined`,
            subtitle: "New creator signup",
            timestamp: r.created_at,
            link: "/admin/creators",
          });
        });
      }

      // Ad launches
      (launchesRes.data || []).forEach((l: any) => {
        const isCompleted = l.status === "completed";
        const isFailed = l.status === "failed";
        const isProcessing = l.status === "processing";
        feedEvents.push({
          id: `launch-${l.id}`,
          type: isFailed ? "ad_launch_failed" : "ad_launch",
          title: isProcessing
            ? `Ad launch processing (${l.total_ads} ads)…`
            : isCompleted
            ? `${l.ads_created}/${l.total_ads} ads launched successfully`
            : `Ad launch failed: ${l.error_message?.slice(0, 60) || "unknown error"}`,
          subtitle: isProcessing ? "Meta Ads pipeline running" : isCompleted ? "Ads are now live on Meta" : "Review & retry in Ads Builder",
          timestamp: l.completed_at || l.updated_at || l.created_at,
          link: "/ads/builder",
        });
      });

      // Sort by timestamp desc
      feedEvents.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setEvents(feedEvents.slice(0, 20));
    } catch (error) {
      console.error("Error fetching activity feed:", error);
    } finally {
      setLoading(false);
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "submission":
        return <Clock className="w-4 h-4" />;
      case "approval":
        return <CheckCircle2 className="w-4 h-4" />;
      case "rejection":
        return <XCircle className="w-4 h-4" />;
      case "payout":
        return <DollarSign className="w-4 h-4" />;
      case "creator_joined":
        return <UserPlus className="w-4 h-4" />;
      case "ad_launch":
        return <Rocket className="w-4 h-4" />;
      case "ad_launch_failed":
        return <AlertTriangle className="w-4 h-4" />;
      case "revenue_milestone":
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <FileVideo className="w-4 h-4" />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case "submission":
        return "bg-amber-500/10 text-amber-500";
      case "approval":
        return "bg-emerald-500/10 text-emerald-500";
      case "rejection":
        return "bg-destructive/10 text-destructive";
      case "payout":
        return "bg-success/10 text-success";
      case "creator_joined":
        return "bg-info/10 text-info";
      case "ad_launch":
        return "bg-primary/10 text-primary";
      case "ad_launch_failed":
        return "bg-destructive/10 text-destructive";
      case "revenue_milestone":
        return "bg-amber-500/10 text-amber-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-3 md:p-6 pb-3">
          <CardTitle className="text-lg font-semibold">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-3 md:p-6 pb-3">
        <CardTitle className="text-lg font-semibold">Activity Feed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 max-h-[250px] md:max-h-[400px] overflow-y-auto p-3 md:p-6">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No activity yet
          </p>
        ) : (
          <>
            {(isMobile ? events.slice(0, 5) : events).map((event) => (
              <Link
                key={event.id}
                to={event.link}
                className="flex items-start gap-2.5 md:gap-3 p-2 md:p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group"
              >
                <div
                  className={`p-1 md:p-1.5 rounded-lg shrink-0 ${getIconColor(event.type)}`}
                >
                  {getIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {event.title}
                  </p>
                  <p className="text-[10px] md:text-xs text-muted-foreground truncate">{event.subtitle}</p>
                  <span className="text-[10px] text-muted-foreground md:hidden">
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5 hidden md:block">
                  {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                </span>
              </Link>
            ))}
            {isMobile && events.length > 5 && (
              <Button variant="ghost" size="sm" className="w-full text-xs mt-1" asChild>
                <Link to="/admin/submissions">
                  View all activity <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
