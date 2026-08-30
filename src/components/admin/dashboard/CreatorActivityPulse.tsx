import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileVideo, Clock, Users, UserPlus, Loader2 } from "lucide-react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

interface ActivityData {
  submissionsToday: number;
  pendingReviews: number;
  activeCreators7d: number;
  newCreatorsThisWeek: number;
}

export function CreatorActivityPulse() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const debouncedFetch = useDebouncedCallback(() => fetchActivity(), 500);

  useEffect(() => {
    fetchActivity();

    const channel = supabase
      .channel("creator-pulse")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "videos" }, () => debouncedFetch())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "videos" }, () => debouncedFetch())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_roles" }, () => debouncedFetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchActivity() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [videosToday, pendingVids, activeCreators, newCreators] = await Promise.all([
        supabase.from("videos").select("id", { count: "exact", head: true }).gte("created_at", today),
        supabase.from("videos").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("videos").select("creator_id").gte("created_at", weekAgo),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "creator").gte("created_at", weekAgo),
      ]);

      const uniqueCreators = new Set((activeCreators.data || []).map((v: any) => v.creator_id));

      setData({
        submissionsToday: videosToday.count || 0,
        pendingReviews: pendingVids.count || 0,
        activeCreators7d: uniqueCreators.size,
        newCreatorsThisWeek: newCreators.count || 0,
      });
    } catch (err) {
      console.error("Error fetching activity pulse:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-3 md:p-6 pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Creator Pulse
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const items = [
    {
      label: "Submissions Today",
      value: data.submissionsToday,
      icon: FileVideo,
      color: "text-primary",
      bg: "bg-primary/10",
      link: "/admin/submissions",
    },
    {
      label: "Pending Review",
      value: data.pendingReviews,
      icon: Clock,
      color: data.pendingReviews > 0 ? "text-amber-500" : "text-muted-foreground",
      bg: data.pendingReviews > 0 ? "bg-amber-500/10" : "bg-muted",
      urgent: data.pendingReviews > 0,
      link: "/admin/submissions",
    },
    {
      label: "Active Creators (7d)",
      value: data.activeCreators7d,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      link: "/admin/creators",
    },
    {
      label: "New This Week",
      value: data.newCreatorsThisWeek,
      icon: UserPlus,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      link: "/admin/creators",
    },
  ];

  return (
    <Card>
      <CardHeader className="p-3 md:p-6 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Creator Pulse
          </CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-6">
        {/* Mobile: 2x2 grid, Desktop: vertical list */}
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-col md:gap-2">
          {items.map((item) => (
            <div
              key={item.label}
              onClick={() => item.link && navigate(item.link)}
              className={`flex flex-col items-center text-center p-2.5 rounded-lg bg-secondary/30 md:flex-row md:text-left md:items-center md:gap-3 ${item.link ? "cursor-pointer hover:bg-secondary/50 transition-colors" : ""}`}
            >
              <div className={`p-1.5 rounded-lg ${item.bg} mb-1.5 md:mb-0`}>
                <item.icon className={`w-4 h-4 ${item.color}`} />
              </div>
              <span className="text-lg font-bold tabular-nums md:order-last md:ml-auto">
                {item.value}
              </span>
              <span className="text-[10px] md:text-sm text-muted-foreground md:flex-1">{item.label}</span>
              {item.urgent && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 mt-1 md:mt-0 cursor-pointer">
                  Action
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
