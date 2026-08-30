import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Plus, Edit, Trash2, Target, CalendarDays, Users, DollarSign, CheckCircle, Clock, RefreshCw, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

type Bounty = Tables<"bounties">;
type WeeklyChallenge = Tables<"weekly_challenges">;

interface CreatorBountyWithProfile {
  id: string;
  bounty_id: string;
  creator_id: string;
  qualified: boolean;
  qualified_at: string | null;
  payout_approved: boolean;
  creator: {
    id: string;
    full_name: string;
    email: string;
  };
  bounty: {
    title: string;
    reward_amount: number;
  };
}

export default function AdminRewards() {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [challenges, setChallenges] = useState<WeeklyChallenge[]>([]);
  const [qualifiedCreators, setQualifiedCreators] = useState<CreatorBountyWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingBounties, setCheckingBounties] = useState(false);
  const [bountyDialogOpen, setBountyDialogOpen] = useState(false);
  const [challengeDialogOpen, setChallengeDialogOpen] = useState(false);
  const [editingBounty, setEditingBounty] = useState<Bounty | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<WeeklyChallenge | null>(null);
  
  const [bountyForm, setBountyForm] = useState({
    title: "",
    description: "",
    milestone_type: "views",
    milestone_value: 1000,
    reward_amount: 50,
    xp_reward: 0,
    time_limit_days: 30,
    expires_at: "",
    status: "active" as "active" | "completed" | "cancelled",
  });

  const [challengeForm, setChallengeForm] = useState({
    title: "",
    description: "",
    challenge_type: "upload_count",
    target_value: 5,
    xp_reward: 100,
    bonus_reward: 25,
    week_start: startOfWeek(new Date(), { weekStartsOn: 0 }),
    week_end: endOfWeek(new Date(), { weekStartsOn: 0 }),
    is_active: true,
    is_recurring: false,
  });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchBounties(), fetchChallenges(), fetchQualifiedCreators()]);
    setLoading(false);
  }

  async function fetchBounties() {
    try {
      const { data, error } = await supabase
        .from("bounties")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBounties(data || []);
    } catch (error) {
      console.error("Error fetching bounties:", error);
      toast.error("Failed to load bounties");
    }
  }

  async function fetchChallenges() {
    try {
      const { data, error } = await supabase
        .from("weekly_challenges")
        .select("*")
        .order("week_start", { ascending: false });

      if (error) throw error;
      setChallenges(data || []);
    } catch (error) {
      console.error("Error fetching challenges:", error);
      toast.error("Failed to load challenges");
    }
  }

  async function fetchQualifiedCreators() {
    try {
      const { data, error } = await supabase
        .from("creator_bounties")
        .select(`
          id,
          bounty_id,
          creator_id,
          qualified,
          qualified_at,
          payout_approved,
          creator:profiles!creator_bounties_creator_id_fkey(id, full_name, email),
          bounty:bounties!creator_bounties_bounty_id_fkey(title, reward_amount)
        `)
        .eq("qualified", true)
        .order("qualified_at", { ascending: false });

      if (error) throw error;
      setQualifiedCreators((data as any) || []);
    } catch (error) {
      console.error("Error fetching qualified creators:", error);
    }
  }

  async function handleBountySubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const bountyData = {
        title: bountyForm.title,
        description: bountyForm.description,
        milestone_type: bountyForm.milestone_type,
        milestone_value: bountyForm.milestone_value,
        reward_amount: bountyForm.reward_amount,
        xp_reward: bountyForm.xp_reward,
        time_limit_days: bountyForm.time_limit_days,
        expires_at: bountyForm.expires_at ? new Date(bountyForm.expires_at).toISOString() : null,
      };

      if (editingBounty) {
        const { error } = await supabase
          .from("bounties")
          .update({
            ...bountyData,
            status: bountyForm.status,
          })
          .eq("id", editingBounty.id);

        if (error) throw error;
        toast.success("Bounty updated successfully");
      } else {
        const { error } = await supabase.from("bounties").insert({
          ...bountyData,
          status: bountyForm.status,
        });

        if (error) throw error;
        toast.success("Bounty created successfully");
      }

      setBountyDialogOpen(false);
      resetBountyForm();
      fetchBounties();
    } catch (error) {
      console.error("Error saving bounty:", error);
      toast.error("Failed to save bounty");
    }
  }

  async function handleChallengeSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const challengeData = {
        title: challengeForm.title,
        description: challengeForm.description,
        challenge_type: challengeForm.challenge_type,
        target_value: challengeForm.target_value,
        xp_reward: challengeForm.xp_reward,
        bonus_reward: challengeForm.bonus_reward || null,
        week_start: format(challengeForm.week_start, "yyyy-MM-dd"),
        week_end: format(challengeForm.week_end, "yyyy-MM-dd"),
        is_active: challengeForm.is_active,
        is_recurring: challengeForm.is_recurring,
      } as any;

      if (editingChallenge) {
        const { error } = await supabase
          .from("weekly_challenges")
          .update(challengeData)
          .eq("id", editingChallenge.id);

        if (error) throw error;
        toast.success("Challenge updated successfully");
      } else {
        const { error } = await supabase.from("weekly_challenges").insert(challengeData);

        if (error) throw error;
        toast.success("Challenge created successfully");
      }

      setChallengeDialogOpen(false);
      resetChallengeForm();
      fetchChallenges();
    } catch (error) {
      console.error("Error saving challenge:", error);
      toast.error("Failed to save challenge");
    }
  }

  async function handleDeleteBounty(id: string) {
    if (!confirm("Are you sure you want to delete this bounty?")) return;

    try {
      const { error } = await supabase.from("bounties").delete().eq("id", id);
      if (error) throw error;
      toast.success("Bounty deleted");
      fetchBounties();
    } catch (error) {
      console.error("Error deleting bounty:", error);
      toast.error("Failed to delete bounty");
    }
  }

  async function handleDeleteChallenge(id: string) {
    if (!confirm("Are you sure you want to delete this challenge?")) return;

    try {
      const { error } = await supabase.from("weekly_challenges").delete().eq("id", id);
      if (error) throw error;
      toast.success("Challenge deleted");
      fetchChallenges();
    } catch (error) {
      console.error("Error deleting challenge:", error);
      toast.error("Failed to delete challenge");
    }
  }

  async function handleApprovePayout(creatorBountyId: string, creatorId: string, amount: number, bountyTitle: string) {
    try {
      // Update the creator_bounty record
      const { error: updateError } = await supabase
        .from("creator_bounties")
        .update({ payout_approved: true })
        .eq("id", creatorBountyId);

      if (updateError) throw updateError;

      // Create a payout record
      const { error: payoutError } = await supabase
        .from("payouts")
        .insert({
          creator_id: creatorId,
          amount: amount,
          payout_type: "bounty",
          status: "pending",
          notes: `Bounty reward: ${bountyTitle}`,
        });

      if (payoutError) throw payoutError;

      toast.success("Payout approved! Added to pending payouts.");
      fetchQualifiedCreators();
    } catch (error) {
      console.error("Error approving payout:", error);
      toast.error("Failed to approve payout");
    }
  }

  async function toggleChallengeActive(id: string, isActive: boolean) {
    try {
      const { error } = await supabase
        .from("weekly_challenges")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;
      toast.success(isActive ? "Challenge activated" : "Challenge deactivated");
      fetchChallenges();
    } catch (error) {
      console.error("Error toggling challenge:", error);
      toast.error("Failed to update challenge");
    }
  }

  async function runBountyCheck() {
    setCheckingBounties(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-bounty-qualifications");
      
      if (error) throw error;
      
      if (data?.newQualifications > 0) {
        toast.success(`Found ${data.newQualifications} new qualification(s)! Notifications sent.`);
      } else {
        toast.info("Bounty check complete. No new qualifications found.");
      }
      
      // Refresh the data
      await fetchAll();
    } catch (error) {
      console.error("Error running bounty check:", error);
      toast.error("Failed to run bounty check");
    } finally {
      setCheckingBounties(false);
    }
  }

  function openEditBounty(bounty: Bounty) {
    setEditingBounty(bounty);
    // Format expires_at for datetime-local input
    let expiresAtLocal = "";
    if ((bounty as any).expires_at) {
      const d = new Date((bounty as any).expires_at);
      expiresAtLocal = format(d, "yyyy-MM-dd'T'HH:mm");
    }
    setBountyForm({
      title: bounty.title,
      description: bounty.description || "",
      milestone_type: bounty.milestone_type,
      milestone_value: bounty.milestone_value,
      reward_amount: Number(bounty.reward_amount),
      xp_reward: (bounty as any).xp_reward || 0,
      time_limit_days: bounty.time_limit_days || 30,
      expires_at: expiresAtLocal,
      status: bounty.status,
    });
    setBountyDialogOpen(true);
  }

  function openEditChallenge(challenge: WeeklyChallenge) {
    setEditingChallenge(challenge);
    setChallengeForm({
      title: challenge.title,
      description: challenge.description || "",
      challenge_type: challenge.challenge_type,
      target_value: challenge.target_value,
      xp_reward: challenge.xp_reward,
      bonus_reward: challenge.bonus_reward || 0,
      week_start: new Date(challenge.week_start),
      week_end: new Date(challenge.week_end),
      is_active: challenge.is_active,
      is_recurring: (challenge as any).is_recurring || false,
    });
    setChallengeDialogOpen(true);
  }

  function resetBountyForm() {
    setEditingBounty(null);
    setBountyForm({
      title: "",
      description: "",
      milestone_type: "views",
      milestone_value: 1000,
      reward_amount: 50,
      xp_reward: 0,
      time_limit_days: 30,
      expires_at: "",
      status: "active",
    });
  }

  function resetChallengeForm() {
    setEditingChallenge(null);
    setChallengeForm({
      title: "",
      description: "",
      challenge_type: "upload_count",
      target_value: 5,
      xp_reward: 100,
      bonus_reward: 25,
      week_start: startOfWeek(new Date(), { weekStartsOn: 0 }),
      week_end: endOfWeek(new Date(), { weekStartsOn: 0 }),
      is_active: true,
      is_recurring: false,
    });
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      completed: "secondary",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const challengeTypeOptions = [
    { value: "upload_count", label: "Approved Uploads" },
    { value: "sale_count", label: "Sales (Approved Videos)" },
    { value: "impressions", label: "Impressions (Approved Videos)" },
    { value: "revenue", label: "Revenue (Approved Videos)" },
  ];

  const milestoneTypeOptions = [
    { value: "approved_uploads", label: "Approved Uploads" },
    { value: "views", label: "Views (Approved Videos)" },
    { value: "sales", label: "Sales (Approved Videos)" },
    { value: "revenue", label: "Revenue (Approved Videos)" },
    { value: "impressions", label: "Impressions (Approved Videos)" },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="h-8 w-48 bg-muted/50 rounded animate-pulse" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              Rewards & Challenges
            </h1>
            <p className="text-sm text-muted-foreground">Manage bounties, challenges, and incentives</p>
          </div>
          <Button 
            onClick={runBountyCheck} 
            disabled={checkingBounties}
            variant="outline"
            className="gap-2"
          >
            {checkingBounties ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking Qualifications...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Daily Check
              </>
            )}
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Bounties</p>
                <p className="text-2xl font-bold">{bounties.filter(b => b.status === "active").length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Challenges</p>
                <p className="text-2xl font-bold">{challenges.filter(c => c.is_active).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Qualified Creators</p>
                <p className="text-2xl font-bold">{qualifiedCreators.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Payouts</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    qualifiedCreators
                      .filter(c => !c.payout_approved)
                      .reduce((sum, c) => sum + Number(c.bounty?.reward_amount || 0), 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="bounties" className="space-y-4">
          <TabsList className="w-full sm:w-auto flex overflow-x-auto">
            <TabsTrigger value="bounties" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <Trophy className="w-4 h-4" />
              <span>Bounties</span>
            </TabsTrigger>
            <TabsTrigger value="challenges" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">Weekly </span>Challenges
            </TabsTrigger>
            <TabsTrigger value="qualified" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>Qualified</span>
            </TabsTrigger>
            <TabsTrigger value="shop" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <DollarSign className="w-4 h-4" />
              <span>Shop</span>
            </TabsTrigger>
            <TabsTrigger value="redemptions" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <Clock className="w-4 h-4" />
              <span>Redemptions</span>
            </TabsTrigger>
          </TabsList>

          {/* Bounties Tab */}
          <TabsContent value="bounties" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={bountyDialogOpen} onOpenChange={(open) => {
                setBountyDialogOpen(open);
                if (!open) resetBountyForm();
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Bounty
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingBounty ? "Edit Bounty" : "Create New Bounty"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleBountySubmit} className="space-y-4">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={bountyForm.title}
                        onChange={(e) => setBountyForm({ ...bountyForm, title: e.target.value })}
                        placeholder="e.g., First 10K Views Bonus"
                        required
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={bountyForm.description}
                        onChange={(e) => setBountyForm({ ...bountyForm, description: e.target.value })}
                        placeholder="Describe the bounty..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Milestone Type</Label>
                        <Select
                          value={bountyForm.milestone_type}
                          onValueChange={(value) => setBountyForm({ ...bountyForm, milestone_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {milestoneTypeOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Target Value</Label>
                        <Input
                          type="number"
                          value={bountyForm.milestone_value}
                          onChange={(e) => setBountyForm({ ...bountyForm, milestone_value: parseInt(e.target.value) })}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Reward Amount ($)</Label>
                        <Input
                          type="number"
                          value={bountyForm.reward_amount}
                          onChange={(e) => setBountyForm({ ...bountyForm, reward_amount: parseFloat(e.target.value) })}
                          required
                        />
                      </div>
                      <div>
                        <Label>XP Reward</Label>
                        <Input
                          type="number"
                          value={bountyForm.xp_reward}
                          onChange={(e) => setBountyForm({ ...bountyForm, xp_reward: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Expires At (exact date & time)</Label>
                      <Input
                        type="datetime-local"
                        value={bountyForm.expires_at}
                        onChange={(e) => setBountyForm({ ...bountyForm, expires_at: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Leave empty for no expiration</p>
                    </div>
                    <div>
                      <Label>Fallback: Time Limit (days)</Label>
                      <Input
                        type="number"
                        value={bountyForm.time_limit_days}
                        onChange={(e) => setBountyForm({ ...bountyForm, time_limit_days: parseInt(e.target.value) })}
                        placeholder="Used if no exact date set"
                      />
                    </div>
                    {editingBounty && (
                      <div>
                        <Label>Status</Label>
                        <Select
                          value={bountyForm.status}
                          onValueChange={(value: "active" | "completed" | "cancelled") => 
                            setBountyForm({ ...bountyForm, status: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button type="submit" className="w-full">
                      {editingBounty ? "Update Bounty" : "Create Bounty"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {bounties.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Trophy className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No bounties created yet</p>
                  <Button variant="outline" className="mt-4" onClick={() => setBountyDialogOpen(true)}>
                    Create your first bounty
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {bounties.map((bounty) => (
                  <Card key={bounty.id} className="relative">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{bounty.title}</CardTitle>
                        {getStatusBadge(bounty.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {bounty.description || "No description"}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Target:</span>
                          <p className="font-medium">{bounty.milestone_value.toLocaleString()} {milestoneTypeOptions.find(o => o.value === bounty.milestone_type)?.label || bounty.milestone_type}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reward:</span>
                          <p className="font-medium text-success">{formatCurrency(Number(bounty.reward_amount))}</p>
                          {(bounty as any).xp_reward > 0 && (
                            <p className="text-xs text-muted-foreground">+{(bounty as any).xp_reward} XP</p>
                          )}
                        </div>
                      </div>
                      {(bounty as any).expires_at ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          Expires: {format(new Date((bounty as any).expires_at), "MMM d, yyyy h:mm a")}
                        </div>
                      ) : bounty.time_limit_days ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          Time limit: {bounty.time_limit_days} days
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditBounty(bounty)}>
                          <Edit className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDeleteBounty(bounty.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Weekly Challenges Tab */}
          <TabsContent value="challenges" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={challengeDialogOpen} onOpenChange={(open) => {
                setChallengeDialogOpen(open);
                if (!open) resetChallengeForm();
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Challenge
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingChallenge ? "Edit Challenge" : "Create Weekly Challenge"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleChallengeSubmit} className="space-y-4">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={challengeForm.title}
                        onChange={(e) => setChallengeForm({ ...challengeForm, title: e.target.value })}
                        placeholder="e.g., Upload Champion"
                        required
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={challengeForm.description}
                        onChange={(e) => setChallengeForm({ ...challengeForm, description: e.target.value })}
                        placeholder="Describe the challenge..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Challenge Type</Label>
                        <Select
                          value={challengeForm.challenge_type}
                          onValueChange={(value) => setChallengeForm({ ...challengeForm, challenge_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {challengeTypeOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Target Value</Label>
                        <Input
                          type="number"
                          value={challengeForm.target_value}
                          onChange={(e) => setChallengeForm({ ...challengeForm, target_value: parseInt(e.target.value) })}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>XP Reward</Label>
                        <Input
                          type="number"
                          value={challengeForm.xp_reward}
                          onChange={(e) => setChallengeForm({ ...challengeForm, xp_reward: parseInt(e.target.value) })}
                          required
                        />
                      </div>
                      <div>
                        <Label>Cash Bonus ($)</Label>
                        <Input
                          type="number"
                          value={challengeForm.bonus_reward}
                          onChange={(e) => setChallengeForm({ ...challengeForm, bonus_reward: parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarDays className="mr-2 h-4 w-4" />
                              {format(challengeForm.week_start, "MMM d, yyyy")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={challengeForm.week_start}
                              onSelect={(date) => date && setChallengeForm({ 
                                ...challengeForm, 
                                week_start: date,
                                week_end: addDays(date, 6)
                              })}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label>End Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarDays className="mr-2 h-4 w-4" />
                              {format(challengeForm.week_end, "MMM d, yyyy")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={challengeForm.week_end}
                              onSelect={(date) => date && setChallengeForm({ ...challengeForm, week_end: date })}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="is_active">Active</Label>
                      <Switch
                        id="is_active"
                        checked={challengeForm.is_active}
                        onCheckedChange={(checked) => setChallengeForm({ ...challengeForm, is_active: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="is_recurring">Recurring</Label>
                        <p className="text-xs text-muted-foreground">Auto-resets each week</p>
                      </div>
                      <Switch
                        id="is_recurring"
                        checked={challengeForm.is_recurring}
                        onCheckedChange={(checked) => setChallengeForm({ ...challengeForm, is_recurring: checked })}
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      {editingChallenge ? "Update Challenge" : "Create Challenge"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {challenges.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Target className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No challenges created yet</p>
                  <Button variant="outline" className="mt-4" onClick={() => setChallengeDialogOpen(true)}>
                    Create your first challenge
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {challenges.map((challenge) => {
                  const isExpired = new Date(challenge.week_end) < new Date();
                  const isCurrent = new Date(challenge.week_start) <= new Date() && new Date(challenge.week_end) >= new Date();
                  
                  return (
                    <Card key={challenge.id} className={cn(
                      "relative",
                      !challenge.is_active && "opacity-60",
                      isCurrent && challenge.is_active && "ring-2 ring-primary/50"
                    )}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{challenge.title}</CardTitle>
                          <div className="flex flex-wrap gap-1">
                            {(challenge as any).is_recurring && challenge.is_active && (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">Recurring</Badge>
                            )}
                            {isCurrent && challenge.is_active && (
                              <Badge variant="default" className="bg-primary">Current</Badge>
                            )}
                            {isExpired && (
                              <Badge variant="secondary">Ended</Badge>
                            )}
                            {!challenge.is_active && (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {challenge.description || "No description"}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Type:</span>
                            <p className="font-medium">{challengeTypeOptions.find(o => o.value === challenge.challenge_type)?.label || challenge.challenge_type.replace("_", " ")}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Target:</span>
                            <p className="font-medium">{challenge.target_value.toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">XP:</span>
                            <p className="font-medium text-amber-500">+{challenge.xp_reward}</p>
                          </div>
                          {challenge.bonus_reward && (
                            <div>
                              <span className="text-muted-foreground">Bonus:</span>
                              <p className="font-medium text-success">{formatCurrency(Number(challenge.bonus_reward))}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CalendarDays className="w-3 h-3" />
                          {format(new Date(challenge.week_start), "MMM d")} - {format(new Date(challenge.week_end), "MMM d, yyyy")}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={challenge.is_active}
                              onCheckedChange={(checked) => toggleChallengeActive(challenge.id, checked)}
                            />
                            <span className="text-sm text-muted-foreground">Active</span>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditChallenge(challenge)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteChallenge(challenge.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Qualified Creators Tab */}
          <TabsContent value="qualified" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-success" />
                  Qualified Creators
                </CardTitle>
              </CardHeader>
              <CardContent>
                {qualifiedCreators.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No creators have qualified for bounties yet</p>
                  </div>
                ) : (
                  <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3">
                    {qualifiedCreators.map((cb) => (
                      <div key={cb.id} className="border rounded-lg p-3 bg-card space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{cb.creator?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{cb.bounty?.title}</p>
                          </div>
                          <span className="font-bold text-success text-sm">{formatCurrency(Number(cb.bounty?.reward_amount || 0))}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          {cb.payout_approved ? (
                            <Badge className="bg-success text-xs">Approved</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Pending</Badge>
                          )}
                          {!cb.payout_approved && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleApprovePayout(cb.id, cb.creator_id, Number(cb.bounty?.reward_amount || 0), cb.bounty?.title || "")}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Creator</TableHead>
                          <TableHead>Bounty</TableHead>
                          <TableHead>Reward</TableHead>
                          <TableHead>Qualified At</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {qualifiedCreators.map((cb) => (
                          <TableRow key={cb.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{cb.creator?.full_name}</p>
                                <p className="text-xs text-muted-foreground">{cb.creator?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>{cb.bounty?.title}</TableCell>
                            <TableCell className="font-medium text-success">
                              {formatCurrency(Number(cb.bounty?.reward_amount || 0))}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {cb.qualified_at ? format(new Date(cb.qualified_at), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell>
                              {cb.payout_approved ? (
                                <Badge className="bg-success">Approved</Badge>
                              ) : (
                                <Badge variant="outline">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!cb.payout_approved && (
                                <Button
                                  size="sm"
                                  onClick={() => handleApprovePayout(cb.id, cb.creator_id, Number(cb.bounty?.reward_amount || 0), cb.bounty?.title || "")}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Approve Payout
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* Shop Items Tab */}
          <TabsContent value="shop">
            <ShopItemsTab />
          </TabsContent>

          {/* Redemptions Tab */}
          <TabsContent value="redemptions">
            <RedemptionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function ShopItemsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", xp_cost: 500, reward_type: "cash", cash_value: 5, is_active: true });

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    const { data } = await supabase.from("reward_shop_items").select("*").order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { title: form.title, description: form.description, xp_cost: form.xp_cost, reward_type: form.reward_type, cash_value: form.cash_value, is_active: form.is_active };
    if (editing) {
      const { error } = await supabase.from("reward_shop_items").update(payload).eq("id", editing.id);
      if (error) { toast.error("Failed to update"); return; }
      toast.success("Item updated");
    } else {
      const { error } = await supabase.from("reward_shop_items").insert(payload);
      if (error) { toast.error("Failed to create"); return; }
      toast.success("Item created");
    }
    setDialogOpen(false);
    setEditing(null);
    setForm({ title: "", description: "", xp_cost: 500, reward_type: "cash", cash_value: 5, is_active: true });
    fetchItems();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this shop item?")) return;
    await supabase.from("reward_shop_items").delete().eq("id", id);
    toast.success("Deleted");
    fetchItems();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from("reward_shop_items").update({ is_active: active }).eq("id", id);
    fetchItems();
  }

  function openEdit(item: any) {
    setEditing(item);
    setForm({ title: item.title, description: item.description || "", xp_cost: item.xp_cost, reward_type: item.reward_type, cash_value: item.cash_value || 0, is_active: item.is_active });
    setDialogOpen(true);
  }

  if (loading) return <div className="h-32 bg-muted/50 rounded-lg animate-pulse" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Reward Shop Items</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditing(null); setForm({ title: "", description: "", xp_cost: 500, reward_type: "cash", cash_value: 5, is_active: true }); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Item</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Edit Item" : "New Shop Item"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>XP Cost</Label><Input type="number" value={form.xp_cost} onChange={e => setForm({ ...form, xp_cost: Number(e.target.value) })} required /></div>
                <div><Label>Cash Value ($)</Label><Input type="number" step="0.01" value={form.cash_value} onChange={e => setForm({ ...form, cash_value: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={form.reward_type} onValueChange={v => setForm({ ...form, reward_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="boost">Commission Boost</SelectItem>
                      <SelectItem value="priority">Priority Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                  <Label>Active</Label>
                </div>
              </div>
              <Button type="submit" className="w-full">{editing ? "Update" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No shop items yet. Create one to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>XP Cost</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.xp_cost.toLocaleString()} XP</TableCell>
                    <TableCell>${Number(item.cash_value || 0).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline">{item.reward_type}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={item.is_active} onCheckedChange={v => toggleActive(item.id, v)} />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Edit className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RedemptionsTab() {
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchRedemptions(); }, []);

  async function fetchRedemptions() {
    setLoading(true);
    const { data } = await supabase
      .from("reward_redemptions")
      .select("*, creator:profiles!reward_redemptions_creator_id_fkey(full_name, email), shop_item:reward_shop_items!reward_redemptions_shop_item_id_fkey(title, xp_cost, cash_value)")
      .order("created_at", { ascending: false });
    setRedemptions(data || []);
    setLoading(false);
  }

  async function handleAction(id: string, status: "approved" | "rejected") {
    const { error } = await supabase
      .from("reward_redemptions")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success(status === "approved" ? "Redemption approved!" : "Redemption rejected");
    fetchRedemptions();
  }

  if (loading) return <div className="h-32 bg-muted/50 rounded-lg animate-pulse" />;

  const pending = redemptions.filter(r => r.status === "pending");
  const processed = redemptions.filter(r => r.status !== "pending");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-lg">Pending Redemptions ({pending.length})</CardTitle></CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pending redemptions 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Creator</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>XP Spent</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.creator?.full_name || "Unknown"}</TableCell>
                      <TableCell>{r.shop_item?.title || "—"}</TableCell>
                      <TableCell>{r.xp_spent?.toLocaleString()} XP</TableCell>
                      <TableCell>${Number(r.shop_item?.cash_value || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" onClick={() => handleAction(r.id, "approved")} className="gap-1"><CheckCircle className="w-3.5 h-3.5" />Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleAction(r.id, "rejected")} className="gap-1"><Trash2 className="w-3.5 h-3.5" />Reject</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {processed.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">History</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Creator</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>XP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processed.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.creator?.full_name || "Unknown"}</TableCell>
                      <TableCell>{r.shop_item?.title || "—"}</TableCell>
                      <TableCell>{r.xp_spent?.toLocaleString()}</TableCell>
                      <TableCell><Badge variant={r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "MMM d")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
