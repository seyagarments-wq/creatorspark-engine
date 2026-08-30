import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LiveMetaMetrics } from "@/components/admin/dashboard/LiveMetaMetrics";
import { CreatorActivityPulse } from "@/components/admin/dashboard/CreatorActivityPulse";
import { RevenueTracker } from "@/components/admin/dashboard/RevenueTracker";
import { DashboardLeaderboard } from "@/components/admin/dashboard/DashboardLeaderboard";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { ApprovalSLAWidget } from "@/components/admin/dashboard/ApprovalSLAWidget";

export default function AdminDashboard() {
  const { fullName } = useAuth();
  const [hasActionItems, setHasActionItems] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkActionItems();
  }, []);

  async function checkActionItems() {
    try {
      const [pendingRes, payoutsRes] = await Promise.all([
        supabase.from("videos").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payouts").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setHasActionItems((pendingRes.count || 0) > 0 || (payoutsRes.count || 0) > 0);
    } catch (err) {
      console.error("Error checking action items:", err);
    } finally {
      setLoading(false);
    }
  }

  const firstName = fullName?.split(" ")[0] || "there";

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4 md:space-y-6">
          <div className="h-10 w-64 bg-muted/50 rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 md:h-28 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
            <div className="h-48 md:h-72 bg-muted/50 rounded-xl animate-pulse" />
            <div className="h-48 md:h-72 bg-muted/50 rounded-xl animate-pulse" />
            <div className="h-48 md:h-72 bg-muted/50 rounded-xl animate-pulse" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Welcome Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-2xl font-semibold">Welcome back, {firstName}!</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Real-time platform overview</p>
          </div>
          {!hasActionItems && (
            <Badge variant="outline" className="bg-success/10 text-success border-success/20 gap-1.5 shrink-0 text-[10px] md:text-xs">
              <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span className="hidden sm:inline">You're all caught up</span>
              <span className="sm:hidden">All clear</span>
            </Badge>
          )}
        </div>

        {/* Live Meta Ad Performance */}
        <LiveMetaMetrics />

        {/* Creator Pulse + Revenue + Activity Feed */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <CreatorActivityPulse />
          <RevenueTracker />
          <ActivityFeed />
        </div>

        {/* Approval SLA + Leaderboard */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <ApprovalSLAWidget />
          <div className="lg:col-span-2">
            <DashboardLeaderboard />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
