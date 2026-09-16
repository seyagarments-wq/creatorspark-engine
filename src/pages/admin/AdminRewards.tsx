import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Trophy, Plus, Edit, Trash2, Users, DollarSign, CheckCircle, Clock, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

type Bounty = Tables<"bounties">;

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
  const [qualifiedCreators, setQualifiedCreators] = useState<CreatorBountyWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingBounties, setCheckingBounties] = useState(false);
  const [bountyDialogOpen, setBountyDialogOpen] = useState(false);
  const [editingBounty, setEditingBounty] = useState<Bounty | null>(null);
  
  const [bountyForm, setBountyForm] = useState({
    title: "",
    description: "",
    milestone_type: "views",
    milestone_value: 1000,
    reward_amount: 50,
    time_limit_days: 30,
    expires_at: "",
    status: "active" as "active" | "completed" | "cancelled",
  });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchBounties(), fetchQualifiedCreators()]);
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
      time_limit_days: bounty.time_limit_days || 30,
      expires_at: expiresAtLocal,
      status: bounty.status,
    });
    setBountyDialogOpen(true);
  }

  function resetBountyForm() {
    setEditingBounty(null);
    setBountyForm({
      title: "",
      description: "",
      milestone_type: "views",
      milestone_value: 1000,
      reward_amount: 50,
      time_limit_days: 30,
      expires_at: "",
      status: "active",
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
              Rewards
            </h1>
            <p className="text-sm text-muted-foreground">Manage bounties and approve qualified creators</p>
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
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
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
            <TabsTrigger value="qualified" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>Qualified</span>
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
        </Tabs>
      </div>
    </AdminLayout>
  );
}
