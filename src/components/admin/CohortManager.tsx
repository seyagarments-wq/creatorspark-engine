import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { CohortBadge } from "./CohortBadge";
import {
  Plus,
  Loader2,
  Users,
  Trash2,
  Pencil,
  UserMinus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface Cohort {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  memberCount?: number;
}

interface CohortMember {
  id: string;
  creator_id: string;
  added_at: string;
  profile?: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}

interface CreatorOption {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6b7280", "#1e293b",
];

export function CohortManager() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCohort, setEditCohort] = useState<Cohort | null>(null);
  const [deleteCohort, setDeleteCohort] = useState<Cohort | null>(null);
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, CohortMember[]>>({});
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [availableCreators, setAvailableCreators] = useState<CreatorOption[]>([]);
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<string[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);

  const { toast } = useToast();

  useEffect(() => {
    fetchCohorts();
  }, []);

  async function fetchCohorts() {
    try {
      const { data, error } = await supabase
        .from("creator_cohorts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Get member counts
      const { data: memberData } = await supabase
        .from("creator_cohort_members")
        .select("cohort_id");

      const counts: Record<string, number> = {};
      (memberData || []).forEach((m: any) => {
        counts[m.cohort_id] = (counts[m.cohort_id] || 0) + 1;
      });

      setCohorts(
        (data || []).map((c: any) => ({ ...c, memberCount: counts[c.id] || 0 }))
      );
    } catch (err: any) {
      toast({ title: "Error loading cohorts", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function fetchMembers(cohortId: string) {
    const { data, error } = await supabase
      .from("creator_cohort_members")
      .select("id, creator_id, added_at")
      .eq("cohort_id", cohortId);
    if (error) return;

    // Fetch profiles for members
    const creatorIds = (data || []).map((m: any) => m.creator_id);
    if (creatorIds.length === 0) {
      setMembers((prev) => ({ ...prev, [cohortId]: [] }));
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", creatorIds);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => {
      profileMap[p.id] = p;
    });

    setMembers((prev) => ({
      ...prev,
      [cohortId]: (data || []).map((m: any) => ({
        ...m,
        profile: profileMap[m.creator_id],
      })),
    }));
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editCohort) {
        const { error } = await supabase
          .from("creator_cohorts")
          .update({ name: formName, description: formDescription || null, color: formColor })
          .eq("id", editCohort.id);
        if (error) throw error;
        toast({ title: "Cohort updated" });
      } else {
        const { error } = await supabase
          .from("creator_cohorts")
          .insert({ name: formName, description: formDescription || null, color: formColor });
        if (error) throw error;
        toast({ title: "Cohort created" });
      }
      setCreateOpen(false);
      setEditCohort(null);
      resetForm();
      fetchCohorts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteCohort) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("creator_cohorts")
        .delete()
        .eq("id", deleteCohort.id);
      if (error) throw error;
      toast({ title: "Cohort deleted" });
      setDeleteCohort(null);
      fetchCohorts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  async function openAssignDialog(cohortId: string) {
    setAssignOpen(cohortId);
    setSelectedCreatorIds([]);
    setAssignSearch("");

    // Get existing members
    const { data: existing } = await supabase
      .from("creator_cohort_members")
      .select("creator_id")
      .eq("cohort_id", cohortId);
    const existingIds = new Set((existing || []).map((m: any) => m.creator_id));

    // Get all creator profiles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "creator");
    const userIds = (roles || []).map((r: any) => r.user_id);
    if (userIds.length === 0) {
      setAvailableCreators([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("user_id", userIds);

    setAvailableCreators(
      (profiles || []).filter((p: any) => !existingIds.has(p.id))
    );
  }

  async function handleAssign() {
    if (!assignOpen || selectedCreatorIds.length === 0) return;
    setSaving(true);
    try {
      const rows = selectedCreatorIds.map((cid) => ({
        cohort_id: assignOpen,
        creator_id: cid,
      }));
      const { error } = await supabase.from("creator_cohort_members").insert(rows);
      if (error) throw error;
      toast({ title: `${selectedCreatorIds.length} creator(s) added to cohort` });
      setAssignOpen(null);
      fetchCohorts();
      if (expandedCohort) fetchMembers(expandedCohort);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(cohortId: string, memberId: string) {
    const { error } = await supabase
      .from("creator_cohort_members")
      .delete()
      .eq("id", memberId);
    if (error) {
      toast({ title: "Error removing member", variant: "destructive" });
      return;
    }
    toast({ title: "Member removed" });
    fetchMembers(cohortId);
    fetchCohorts();
  }

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormColor(PRESET_COLORS[0]);
  }

  function openEdit(cohort: Cohort) {
    setEditCohort(cohort);
    setFormName(cohort.name);
    setFormDescription(cohort.description || "");
    setFormColor(cohort.color);
    setCreateOpen(true);
  }

  function toggleExpand(cohortId: string) {
    if (expandedCohort === cohortId) {
      setExpandedCohort(null);
    } else {
      setExpandedCohort(cohortId);
      if (!members[cohortId]) fetchMembers(cohortId);
    }
  }

  const filteredAvailable = availableCreators.filter(
    (c) =>
      c.full_name.toLowerCase().includes(assignSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(assignSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Cohorts</h3>
          <p className="text-sm text-muted-foreground">Group creators for challenges, briefs, and messaging</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setEditCohort(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          New Cohort
        </Button>
      </div>

      {cohorts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No cohorts yet. Create one to start grouping creators.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cohorts.map((cohort) => (
            <div key={cohort.id} className="border rounded-lg">
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleExpand(cohort.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedCohort === cohort.id ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <CohortBadge name={cohort.name} color={cohort.color} size="md" />
                  <span className="text-sm text-muted-foreground">
                    {cohort.memberCount} member{cohort.memberCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openAssignDialog(cohort.id)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(cohort)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteCohort(cohort)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {expandedCohort === cohort.id && (
                <div className="border-t px-3 py-2">
                  {cohort.description && (
                    <p className="text-sm text-muted-foreground mb-2">{cohort.description}</p>
                  )}
                  {(!members[cohort.id] || members[cohort.id].length === 0) ? (
                    <p className="text-sm text-muted-foreground py-2">No members yet</p>
                  ) : (
                    <div className="space-y-1">
                      {members[cohort.id].map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              {m.profile?.avatar_url && (
                                <AvatarImage src={m.profile.avatar_url} />
                              )}
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {m.profile?.full_name?.slice(0, 2).toUpperCase() || "??"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{m.profile?.full_name}</p>
                              <p className="text-[10px] text-muted-foreground">{m.profile?.email}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveMember(cohort.id, m.id)}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditCohort(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCohort ? "Edit Cohort" : "Create Cohort"}</DialogTitle>
            <DialogDescription>
              {editCohort ? "Update cohort details" : "Group creators for challenges and targeted briefs"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Spring 2026 Batch"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What's this cohort for?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      formColor === c ? "scale-110 border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editCohort ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Creators Dialog */}
      <Dialog open={!!assignOpen} onOpenChange={(open) => !open && setAssignOpen(null)}>
        <DialogContent className="max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Add Creators to Cohort</DialogTitle>
            <DialogDescription>Select creators to add</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search creators..."
            value={assignSearch}
            onChange={(e) => setAssignSearch(e.target.value)}
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filteredAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No available creators to add
              </p>
            ) : (
              filteredAvailable.map((c) => {
                const selected = selectedCreatorIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                      selected ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                    onClick={() => {
                      setSelectedCreatorIds((prev) =>
                        selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      );
                    }}
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        selected ? "bg-primary border-primary" : "border-border"
                      }`}
                    >
                      {selected && (
                        <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12">
                          <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                        </svg>
                      )}
                    </div>
                    <Avatar className="h-7 w-7">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {c.full_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{c.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.email}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(null)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={saving || selectedCreatorIds.length === 0}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add {selectedCreatorIds.length} Creator{selectedCreatorIds.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteCohort} onOpenChange={(open) => !open && setDeleteCohort(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cohort</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteCohort?.name}</strong>? Members won't be affected, but they'll be removed from this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
