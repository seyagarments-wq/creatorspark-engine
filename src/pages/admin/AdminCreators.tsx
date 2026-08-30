import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  Users,
  Search,
  Video,
  DollarSign,
  Settings,
  Loader2,
  UserPlus,
  Mail,
  Eye,
  MessageSquare,
  TrendingUp,
  CheckCircle,
  Download,
  UserX,
  UserCheck,
  MoreHorizontal,
  Calendar,
  Award,
  Trash2,
  Flame,
  Sun,
  Snowflake,
  Ghost,
  LogIn,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import InviteCreatorDialog from "@/components/admin/InviteCreatorDialog";
import PendingInvites from "@/components/admin/PendingInvites";
import ReferralApplicationsPanel from "@/components/admin/ReferralApplicationsPanel";
import { CohortManager } from "@/components/admin/CohortManager";
import { CohortBadge } from "@/components/admin/CohortBadge";
import { Link } from "react-router-dom";
import { exportToCSV, formatCurrencyForExport, formatDateForExport } from "@/lib/export";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CreatorProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  commission_percentage: number;
  created_at: string;
  status: "active" | "suspended" | "inactive";
  videoCount?: number;
  approvedCount?: number;
  totalEarnings?: number;
  lastVideoDate?: string | null;
  health?: "hot" | "warm" | "cold" | "churned";
  cohorts?: { id: string; name: string; color: string }[];
}

function getTierFromApprovedCount(count: number): { name: string; class: string } {
  if (count >= 250) return { name: "Platinum", class: "tier-platinum" };
  if (count >= 150) return { name: "Gold", class: "tier-gold" };
  if (count >= 75) return { name: "Silver", class: "tier-silver" };
  return { name: "Bronze", class: "tier-bronze" };
}

function getCreatorHealth(lastVideoDate: string | null | undefined): "hot" | "warm" | "cold" | "churned" {
  if (!lastVideoDate) return "churned";
  const days = Math.floor((Date.now() - new Date(lastVideoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 7) return "hot";
  if (days < 30) return "warm";
  if (days < 60) return "cold";
  return "churned";
}

function getHealthBadge(health: string) {
  switch (health) {
    case "hot":
      return { label: "Hot", icon: Flame, className: "bg-orange-500/10 text-orange-500 border-orange-500/30" };
    case "warm":
      return { label: "Warm", icon: Sun, className: "bg-amber-500/10 text-amber-500 border-amber-500/30" };
    case "cold":
      return { label: "Cold", icon: Snowflake, className: "bg-blue-500/10 text-blue-500 border-blue-500/30" };
    case "churned":
      return { label: "Churned", icon: Ghost, className: "bg-destructive/10 text-destructive border-destructive/30" };
    default:
      return { label: "Unknown", icon: Ghost, className: "bg-muted text-muted-foreground border-border" };
  }
}

export default function AdminCreators() {
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [filteredCreators, setFilteredCreators] = useState<CreatorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfile | null>(null);
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [newCommission, setNewCommission] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [showPendingInvites, setShowPendingInvites] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [creatorToDelete, setCreatorToDelete] = useState<CreatorProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [allCohorts, setAllCohorts] = useState<{ id: string; name: string; color: string }[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchCreators();
  }, []);

  useEffect(() => {
    filterCreators();
  }, [creators, searchQuery, cohortFilter]);

  async function fetchCreators() {
    try {
      // First fetch user_ids that have the 'creator' role (NOT admin)
      const { data: creatorRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "creator");

      if (rolesError) throw rolesError;

      const creatorUserIds = creatorRoles?.map(r => r.user_id) || [];

      if (creatorUserIds.length === 0) {
        setCreators([]);
        setLoading(false);
        return;
      }

      // Fetch only profiles for users with creator role
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", creatorUserIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Optimally fetch all related data in batches instead of N+1
      const creatorIds = profiles?.map(p => p.id) || [];
      
      const [allVideosRes, allPayoutsRes, cohortMembersRes, cohortsRes] = await Promise.all([
        supabase
          .from("videos")
          .select("id, creator_id, status, created_at")
          .in("creator_id", creatorIds),
        supabase
          .from("payouts")
          .select("amount, creator_id")
          .eq("status", "paid")
          .in("creator_id", creatorIds),
        supabase
          .from("creator_cohort_members")
          .select("creator_id, cohort_id")
          .in("creator_id", creatorIds),
        supabase
          .from("creator_cohorts")
          .select("id, name, color"),
      ]);

      const allVideos = allVideosRes.data || [];
      const allPayouts = allPayoutsRes.data || [];
      const cohortMembers = cohortMembersRes.data || [];
      const cohortsData = cohortsRes.data || [];
      setAllCohorts(cohortsData as any);

      // Build cohort map per creator
      const cohortMap: Record<string, { id: string; name: string; color: string }[]> = {};
      const cohortLookup: Record<string, any> = {};
      cohortsData.forEach((c: any) => { cohortLookup[c.id] = c; });
      cohortMembers.forEach((m: any) => {
        if (!cohortMap[m.creator_id]) cohortMap[m.creator_id] = [];
        if (cohortLookup[m.cohort_id]) {
          cohortMap[m.creator_id].push(cohortLookup[m.cohort_id]);
        }
      });

      const creatorsWithStats = (profiles || []).map((profile) => {
        const creatorVideos = allVideos.filter(v => v.creator_id === profile.id);
        const creatorPayouts = allPayouts.filter(p => p.creator_id === profile.id);
        
        const videoCount = creatorVideos.length;
        const approvedCount = creatorVideos.filter(v => v.status === "approved").length;
        const totalEarnings = creatorPayouts.reduce((sum, p) => sum + Number(p.amount), 0);
        
        // Find latest video
        const lastVideo = creatorVideos.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        
        const lastVideoDate = lastVideo?.created_at || null;
        const health = getCreatorHealth(lastVideoDate);

        return {
          ...profile,
          status: (profile.status || "active") as "active" | "suspended" | "inactive",
          videoCount,
          approvedCount,
          totalEarnings,
          lastVideoDate,
          health,
          cohorts: cohortMap[profile.id] || [],
        };
      });

      setCreators(creatorsWithStats);
    } catch (error) {
      console.error("Error fetching creators:", error);
    } finally {
      setLoading(false);
    }
  }

  function filterCreators() {
    let filtered = creators;

    // Cohort filter
    if (cohortFilter !== "all") {
      filtered = filtered.filter((c) =>
        c.cohorts?.some((ch) => ch.id === cohortFilter)
      );
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.full_name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query)
      );
    }

    setFilteredCreators(filtered);
  }

  async function handleUpdateCommission() {
    if (!selectedCreator) return;

    const commission = parseFloat(newCommission);
    if (isNaN(commission) || commission < 0 || commission > 100) {
      toast({
        title: "Invalid commission",
        description: "Please enter a value between 0 and 100",
        variant: "destructive",
      });
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ commission_percentage: commission })
        .eq("id", selectedCreator.id);

      if (error) throw error;

      toast({
        title: "Commission updated",
        description: `${selectedCreator.full_name}'s commission is now ${commission}%`,
      });

      setCommissionDialogOpen(false);
      setSelectedCreator(null);
      setNewCommission("");
      fetchCreators();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleImpersonate(creator: CreatorProfile) {
    try {
      toast({ title: "Generating login link…", description: "Please wait" });
      const { data, error } = await supabase.functions.invoke("impersonate-creator", {
        body: { creator_user_id: creator.user_id },
      });
      if (error) throw error;
      if (data?.url) {
        await navigator.clipboard.writeText(data.url);
        toast({
          title: "Link copied!",
          description: `Open in an incognito window to browse as ${creator.full_name}. The link is on your clipboard.`,
        });
      } else {
        throw new Error(data?.error || "No URL returned");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleStartDM(creator: CreatorProfile) {
    if (!user) return;
    
    try {
      // Check if DM already exists
      const { data: existing } = await supabase
        .from("direct_messages")
        .select("id")
        .or(`and(participant1_id.eq.${user.id},participant2_id.eq.${creator.user_id}),and(participant1_id.eq.${creator.user_id},participant2_id.eq.${user.id})`)
        .maybeSingle();

      if (existing) {
        // Navigate to chat with the existing DM
        navigate(`/admin/chat?dm=${existing.id}&name=${encodeURIComponent(creator.full_name)}`);
        return;
      }

      // Create new DM
      const { data: dm, error } = await supabase
        .from("direct_messages")
        .insert({
          participant1_id: user.id,
          participant2_id: creator.user_id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Chat started",
        description: `Started conversation with ${creator.full_name}`,
      });
      
      navigate(`/admin/chat?dm=${dm.id}&name=${encodeURIComponent(creator.full_name)}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleDeleteCreator() {
    if (!creatorToDelete) return;
    setDeleting(true);
    try {
      // Send removal notification emails (personal + broadcast) BEFORE deleting
      await supabase.functions.invoke("creator-removal-notify", {
        body: {
          action: "removed",
          creator_name: creatorToDelete.full_name,
          creator_user_id: creatorToDelete.user_id,
          reason: "lack of uploads",
        },
      });

      const { data, error } = await supabase.functions.invoke("admin-reset-platform", {
        body: { action: "delete_creator", creator_id: creatorToDelete.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Creator deleted",
        description: `${creatorToDelete.full_name} has been permanently deleted. Removal emails sent to all creators.`,
      });
      setDeleteDialogOpen(false);
      setCreatorToDelete(null);
      fetchCreators();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete creator",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleWarnCreator(creator: CreatorProfile) {
    try {
      toast({ title: "Sending warning...", description: `Notifying ${creator.full_name} and the team` });
      const { error } = await supabase.functions.invoke("creator-removal-notify", {
        body: {
          action: "at_risk",
          creator_name: creator.full_name,
          creator_user_id: creator.user_id,
          reason: "lack of uploads in March",
        },
      });
      if (error) throw error;
      toast({
        title: "Warning sent",
        description: `${creator.full_name} has been warned and all creators notified.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send warning",
        variant: "destructive",
      });
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const stats = {
    totalCreators: creators.length,
    activeThisMonth: creators.filter((c) => {
      const createdAt = new Date(c.created_at);
      const now = new Date();
      return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    }).length,
    avgApprovalRate: creators.length > 0
      ? (creators.reduce((sum, c) => {
          const rate = c.videoCount ? (c.approvedCount || 0) / c.videoCount : 0;
          return sum + rate;
        }, 0) / creators.length * 100).toFixed(0)
      : 0,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Creators</h1>
            <p className="text-sm text-muted-foreground">Manage your creator network</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPendingInvites(!showPendingInvites)}
            >
              <Mail className="w-4 h-4 mr-2" />
              Pending Invites
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const exportData = creators.map((c) => ({
                  name: c.full_name,
                  email: c.email,
                  tier: getTierFromApprovedCount(c.approvedCount || 0).name,
                  videos_submitted: c.videoCount || 0,
                  videos_approved: c.approvedCount || 0,
                  total_earnings: formatCurrencyForExport(c.totalEarnings || 0),
                  commission_rate: `${c.commission_percentage}%`,
                  joined: formatDateForExport(c.created_at),
                }));
                exportToCSV(exportData, "creators_export", [
                  { key: "name", header: "Name" },
                  { key: "email", header: "Email" },
                  { key: "tier", header: "Tier" },
                  { key: "videos_submitted", header: "Videos Submitted" },
                  { key: "videos_approved", header: "Videos Approved" },
                  { key: "total_earnings", header: "Total Earnings" },
                  { key: "commission_rate", header: "Commission Rate" },
                  { key: "joined", header: "Joined Date" },
                ]);
                toast({ title: "Export complete", description: "Creator list downloaded as CSV" });
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              variant="success"
              onClick={() => setInviteDialogOpen(true)}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Creator
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCreators}</p>
                <p className="text-sm text-muted-foreground">Total Creators</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-success/10">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeThisMonth}</p>
                <p className="text-sm text-muted-foreground">Joined This Month</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-info/10">
                <CheckCircle className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgApprovalRate}%</p>
                <p className="text-sm text-muted-foreground">Avg Approval Rate</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending invites panel */}
        {showPendingInvites && (
          <div className="stat-card">
            <h3 className="font-semibold mb-4">Pending Invites</h3>
            <PendingInvites />
          </div>
        )}

        {/* Tabs for Directory vs Cohorts */}
        <Tabs defaultValue="directory" className="space-y-4">
          <TabsList>
            <TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
            <TabsTrigger value="applications">Applications</TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="space-y-4">
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search creators..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {allCohorts.length > 0 && (
                <Select value={cohortFilter} onValueChange={setCohortFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cohorts</SelectItem>
                    {allCohorts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

        {/* Table */}
        <div className="stat-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[250px]">Creator</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Approved Videos</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="ml-2 text-muted-foreground">Loading creators...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredCreators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No creators found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCreators.map((creator) => {
                    const tier = getTierFromApprovedCount(creator.approvedCount || 0);
                    const healthBadge = getHealthBadge(creator.health || "unknown");
                    const HealthIcon = healthBadge.icon;

                    return (
                      <TableRow key={creator.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              {creator.avatar_url && (
                                <AvatarImage src={creator.avatar_url} alt={creator.full_name} />
                              )}
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {creator.full_name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <Link
                                to={`/admin/creators/${creator.id}`}
                                className="font-medium text-sm hover:underline hover:text-primary transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {creator.full_name}
                              </Link>
                              <p className="text-xs text-muted-foreground">{creator.email}</p>
                              {creator.cohorts && creator.cohorts.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {creator.cohorts.map((ch) => (
                                    <CohortBadge key={ch.id} name={ch.name} color={ch.color} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 ${healthBadge.className} text-[10px]`}>
                            <HealthIcon className="w-3 h-3" />
                            {healthBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${tier.class} text-[10px]`}>{tier.name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-medium">{creator.approvedCount}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {((creator.approvedCount || 0) / (creator.videoCount || 1) * 100).toFixed(0)}% rate
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-success">
                          {formatCurrency(creator.totalEarnings || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="font-mono">
                            {creator.commission_percentage}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {creator.health === "churned" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                                onClick={() => handleStartDM(creator)}
                              >
                                <MessageSquare className="w-3 h-3 mr-1" />
                                Re-engage
                              </Button>
                            )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/creators/${creator.id}`}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Profile
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleImpersonate(creator)}>
                                <LogIn className="w-4 h-4 mr-2" />
                                View as Creator
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStartDM(creator)}>
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Message
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedCreator(creator);
                                  setNewCommission(creator.commission_percentage.toString());
                                  setCommissionDialogOpen(true);
                                }}
                              >
                                <DollarSign className="w-4 h-4 mr-2" />
                                Set Commission
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-amber-500 focus:text-amber-500"
                                onClick={() => handleWarnCreator(creator)}
                              >
                                <UserX className="w-4 h-4 mr-2" />
                                Warn — At Risk
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setCreatorToDelete(creator);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Creator
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="cohorts">
            <div className="stat-card">
              <CohortManager />
            </div>
          </TabsContent>

          <TabsContent value="applications">
            <div className="stat-card">
              <ReferralApplicationsPanel />
            </div>
          </TabsContent>
        </Tabs>

        {/* Commission Dialog */}
        <Dialog open={commissionDialogOpen} onOpenChange={setCommissionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Commission Rate</DialogTitle>
              <DialogDescription>
                Set the commission percentage for {selectedCreator?.full_name}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="commission" className="w-24">
                  Rate (%)
                </Label>
                <Input
                  id="commission"
                  type="number"
                  min="0"
                  max="100"
                  value={newCommission}
                  onChange={(e) => setNewCommission(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCommissionDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateCommission} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite Dialog */}
        <InviteCreatorDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{creatorToDelete?.full_name}</strong> and all their data, including videos, payouts, and chat history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCreator}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Creator"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
