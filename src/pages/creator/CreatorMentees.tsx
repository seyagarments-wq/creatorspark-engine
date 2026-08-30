import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, TrendingUp, DollarSign, ShoppingCart, CheckCircle, XCircle, Clock, Users, Eye, MousePointerClick, Percent } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface MenteeData {
  id: string;
  full_name: string;
  avatar_url: string | null;
  email: string;
  user_id: string;
  // Computed
  approvedThisMonth: number;
  totalApproved: number;
  totalPending: number;
  totalRejected: number;
  approvalRate: number;
  totalRevenue: number;
  totalCommission: number;
  totalOrders: number;
  totalImpressions: number;
  totalClicks: number;
  totalSpend: number;
}

const GUARANTEE_THRESHOLD = 35;

export default function CreatorMentees() {
  const { profileId } = useAuth();
  const [mentees, setMentees] = useState<MenteeData[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!profileId) return;
    fetchMentees();
  }, [profileId]);

  async function fetchMentees() {
    try {
      // Get active assignments
      const { data: assignments, error: aErr } = await supabase
        .from("mentor_creator_assignments")
        .select("creator_id")
        .eq("mentor_id", profileId!)
        .eq("status", "active");

      if (aErr) throw aErr;
      if (!assignments?.length) {
        setMentees([]);
        setLoading(false);
        return;
      }

      const creatorIds = assignments.map((a) => a.creator_id);

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email, user_id")
        .in("id", creatorIds);

      // Fetch all videos for these creators
      const { data: videos } = await supabase
        .from("videos")
        .select("id, creator_id, status, created_at, bounty_id")
        .in("creator_id", creatorIds);

      // Fetch performance data for these creators' videos
      const videoIds = (videos || []).map((v) => v.id);
      let perfData: any[] = [];
      if (videoIds.length > 0) {
        // Batch in chunks of 100
        for (let i = 0; i < videoIds.length; i += 100) {
          const chunk = videoIds.slice(i, i + 100);
          const { data } = await supabase
            .from("performance_data")
            .select("video_id, revenue, purchases, commission_rate_at_time, impressions, clicks, spend")
            .in("video_id", chunk);
          if (data) perfData.push(...data);
        }
      }

      // Build a map: video_id -> creator_id
      const videoCreatorMap: Record<string, string> = {};
      (videos || []).forEach((v) => {
        videoCreatorMap[v.id] = v.creator_id;
      });

      // Aggregate per creator
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const menteeList: MenteeData[] = (profiles || []).map((p) => {
        const creatorVideos = (videos || []).filter((v) => v.creator_id === p.id);
        const approved = creatorVideos.filter((v) => v.status === "approved");
        const pending = creatorVideos.filter((v) => v.status === "pending");
        const rejected = creatorVideos.filter((v) => v.status === "rejected");

        // This month approved (excl bounty)
        const approvedThisMonth = approved.filter(
          (v) => new Date(v.created_at) >= monthStart && !v.bounty_id
        ).length;

        const totalDecided = approved.length + rejected.length;
        const approvalRate = totalDecided > 0 ? Math.round((approved.length / totalDecided) * 100) : 0;

        // Performance aggregation
        const creatorVideoIds = new Set(creatorVideos.map((v) => v.id));
        const creatorPerf = perfData.filter((pd) => creatorVideoIds.has(pd.video_id));
        const totalRevenue = creatorPerf.reduce((sum, pd) => sum + (Number(pd.revenue) || 0), 0);
        const totalCommission = creatorPerf.reduce(
          (sum, pd) => sum + ((Number(pd.revenue) || 0) * (Number(pd.commission_rate_at_time) || 0)) / 100,
          0
        );
        const totalOrders = creatorPerf.reduce((sum, pd) => sum + (Number(pd.purchases) || 0), 0);
        const totalImpressions = creatorPerf.reduce((sum, pd) => sum + (Number(pd.impressions) || 0), 0);
        const totalClicks = creatorPerf.reduce((sum, pd) => sum + (Number(pd.clicks) || 0), 0);
        const totalSpend = creatorPerf.reduce((sum, pd) => sum + (Number(pd.spend) || 0), 0);

        return {
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          email: p.email,
          user_id: p.user_id,
          approvedThisMonth,
          totalApproved: approved.length,
          totalPending: pending.length,
          totalRejected: rejected.length,
          approvalRate,
          totalRevenue,
          totalCommission,
          totalOrders,
          totalImpressions,
          totalClicks,
          totalSpend,
        };
      });

      setMentees(menteeList);
    } catch (err: any) {
      console.error("Error fetching mentees:", err);
      toast({ title: "Error loading mentees", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleMessage(mentee: MenteeData) {
    try {
      // Find or create DM
      const myUserId = (await supabase.auth.getUser()).data.user?.id;
      if (!myUserId) return;

      const { data: existing } = await supabase
        .from("direct_messages")
        .select("id")
        .or(
          `and(participant1_id.eq.${myUserId},participant2_id.eq.${mentee.user_id}),and(participant1_id.eq.${mentee.user_id},participant2_id.eq.${myUserId})`
        )
        .maybeSingle();

      if (existing) {
        navigate("/creator/chat");
      } else {
        const { error } = await supabase.from("direct_messages").insert({
          participant1_id: myUserId,
          participant2_id: mentee.user_id,
        });
        if (error) throw error;
        navigate("/creator/chat");
      }
    } catch (err: any) {
      toast({ title: "Could not open chat", description: err.message, variant: "destructive" });
    }
  }

  return (
    <CreatorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mentees</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your assigned creators' progress and performance
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : mentees.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold text-lg">No mentees assigned</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Your admin will assign creators to you when ready.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {mentees.map((m) => {
              const progressPct = Math.min((m.approvedThisMonth / GUARANTEE_THRESHOLD) * 100, 100);
              return (
                <Card key={m.id} className="overflow-hidden cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/creator/mentees/${m.id}`)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={m.avatar_url || undefined} />
                          <AvatarFallback className="text-sm font-medium">
                            {m.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-base">{m.full_name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleMessage(m); }}>
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Guarantee progress */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">Monthly guarantee</span>
                        <span className="font-medium">
                          {m.approvedThisMonth}/{GUARANTEE_THRESHOLD}
                        </span>
                      </div>
                      <Progress value={progressPct} className="h-2.5" />
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
                          <Eye className="w-3 h-3" />
                          Impressions
                        </div>
                        <p className="font-semibold text-xs">{m.totalImpressions.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
                          <MousePointerClick className="w-3 h-3" />
                          Clicks
                        </div>
                        <p className="font-semibold text-xs">{m.totalClicks.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
                          <Percent className="w-3 h-3" />
                          Approval Rate
                        </div>
                        <p className="font-semibold text-xs">{m.approvalRate}%</p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
                          <TrendingUp className="w-3 h-3" />
                          Revenue
                        </div>
                        <p className="font-semibold text-xs">
                          ${m.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
                          <DollarSign className="w-3 h-3" />
                          Commission
                        </div>
                        <p className="font-semibold text-xs">
                          ${m.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
                          <ShoppingCart className="w-3 h-3" />
                          Orders
                        </div>
                        <p className="font-semibold text-xs">{m.totalOrders}</p>
                      </div>
                    </div>

                    {/* Video breakdown */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/50">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        {m.totalApproved} approved
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-500" />
                        {m.totalPending} pending
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-destructive" />
                        {m.totalRejected} rejected
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </CreatorLayout>
  );
}
