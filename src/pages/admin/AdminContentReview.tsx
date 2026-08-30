import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Check,
  X,
  Loader2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  RotateCcw,
  Search,
  Filter,
  CheckSquare,
  ArrowUpDown,
  CalendarDays,
  Zap,
  RefreshCw,
  AlertCircle,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, startOfWeek, subWeeks, subDays, isAfter } from "date-fns";

interface PhotoSubmission {
  id: string;
  bounty_id: string | null;
  creator_id: string;
  title: string | null;
  creative_name: string | null;
  link_url: string | null;
  photo_urls: string[];
  thumbnail_url: string | null;
  edited_count: number;
  raw_count: number;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  meta_status: string | null;
  created_at: string;
  creator_name: string;
  bounty_title: string | null;
}

export default function AdminContentReview() {
  const [submissions, setSubmissions] = useState<PhotoSubmission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<PhotoSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [dateRange, setDateRange] = useState<string>("all_time");
  const [sortDirection, setSortDirection] = useState<"newest" | "oldest">("newest");

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const reviewOpen = reviewIndex !== null;
  const selectedSubmission = reviewIndex !== null ? filteredSubmissions[reviewIndex] ?? null : null;
  const touchStartX = useRef<number | null>(null);

  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [metaConnected, setMetaConnected] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubmissions();
    checkMetaConnection();
  }, []);

  useEffect(() => {
    filterSubmissions();
  }, [submissions, searchQuery, statusFilter, dateRange, sortDirection]);

  // Keyboard navigation in review mode
  useEffect(() => {
    if (!reviewOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && reviewIndex !== null && reviewIndex > 0) {
        setReviewIndex(reviewIndex - 1);
      } else if (e.key === "ArrowRight" && reviewIndex !== null && reviewIndex < filteredSubmissions.length - 1) {
        setReviewIndex(reviewIndex + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reviewOpen, reviewIndex, filteredSubmissions.length]);

  async function checkMetaConnection() {
    const { data } = await supabase
      .from("meta_credentials")
      .select("status")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();
    setMetaConnected(!!data);
  }

  async function fetchSubmissions() {
    try {
      const { data, error } = await supabase
        .from("photo_submissions")
        .select("*, profiles:creator_id(full_name), bounties:bounty_id(title)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((s: any) => ({
        ...s,
        photo_urls: s.photo_urls || [],
        creator_name: s.profiles?.full_name || "Unknown",
        bounty_title: s.bounties?.title || null,
      }));

      setSubmissions(formatted);
    } catch (err) {
      console.error("Error fetching photo submissions:", err);
    } finally {
      setLoading(false);
    }
  }

  function getDateRangeCutoff(range: string): Date | null {
    const now = new Date();
    switch (range) {
      case "this_week": return startOfWeek(now, { weekStartsOn: 1 });
      case "last_week": return startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      case "last_2_weeks": return subWeeks(now, 2);
      case "last_30_days": return subDays(now, 30);
      default: return null;
    }
  }

  function filterSubmissions() {
    let filtered = [...submissions];

    if (statusFilter !== "all") {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }

    const cutoff = getDateRangeCutoff(dateRange);
    if (cutoff) {
      filtered = filtered.filter((s) => isAfter(new Date(s.created_at), cutoff));
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(query) ||
          s.creator_name.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortDirection === "newest" ? dateB - dateA : dateA - dateB;
    });

    setFilteredSubmissions(filtered);
  }

  function updateLocally(id: string, updates: Partial<PhotoSubmission>) {
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  function openLightbox(photos: string[], startIndex = 0) {
    setLightboxPhotos(photos);
    setLightboxIndex(startIndex);
    setLightboxOpen(true);
  }

  function openReview(sub: PhotoSubmission) {
    const idx = filteredSubmissions.findIndex(s => s.id === sub.id);
    if (idx !== -1) setReviewIndex(idx);
    setAdminNotes(sub.admin_notes || "");
  }

  async function handleAction(status: "approved" | "rejected" | "revision") {
    if (!selectedSubmission) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("photo_submissions")
        .update({ status, admin_notes: adminNotes.trim() || null } as any)
        .eq("id", selectedSubmission.id);

      if (error) throw error;

      // Notify creator
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", selectedSubmission.creator_id)
          .single();

        if (profile?.user_id) {
          const messages: Record<string, string> = {
            approved: `Your photo submission "${selectedSubmission.title || "Photos"}" has been approved! 🎉`,
            rejected: `Your photo submission "${selectedSubmission.title || "Photos"}" was not approved. ${adminNotes.trim() || "Please try again."}`,
            revision: `Your photo submission "${selectedSubmission.title || "Photos"}" needs revisions. ${adminNotes.trim() || "Check admin notes for details."}`,
          };

          await supabase.from("notifications").insert({
            user_id: profile.user_id,
            title: status === "approved" ? "Photos Approved! ✅" : status === "rejected" ? "Photos Not Approved" : "Photos Need Revisions",
            message: messages[status],
            link: "/creator/photo-submissions",
          });
        }
      } catch (notifyErr) {
        console.error("Notification error:", notifyErr);
      }

      toast({
        title: status === "approved" ? "Approved ✅" : status === "rejected" ? "Rejected" : "Revision Requested",
      });

      updateLocally(selectedSubmission.id, { status, admin_notes: adminNotes.trim() || null });
      setReviewIndex(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleExportToMeta(sub: PhotoSubmission) {
    if (!metaConnected) {
      toast({ title: "Meta Ads Not Connected", description: "Please connect Meta Ads in Settings first", variant: "destructive" });
      return;
    }
    setExportingId(sub.id);
    try {
      const { data, error } = await supabase.functions.invoke("meta-upload-photo", {
        body: { submissionId: sub.id },
      });
      if (error) {
        // Edge function returned non-2xx — parse the real error from body
        const errMsg = data?.error || error.message || "Unknown export error";
        toast({ title: "Export Failed", description: errMsg, variant: "destructive" });
        updateLocally(sub.id, { meta_status: "error" } as any);
        return;
      }
      if (!data?.uploaded || data.uploaded === 0) {
        toast({ title: "Export Failed", description: data?.error || "Zero photos uploaded to Meta library", variant: "destructive" });
        updateLocally(sub.id, { meta_status: "error" } as any);
        return;
      }
      toast({ title: "Exported to Meta ✅", description: `${data.uploaded} photo(s) uploaded to Meta library.` });
      updateLocally(sub.id, { meta_status: "uploaded" } as any);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
      updateLocally(sub.id, { meta_status: "error" } as any);
    } finally {
      setExportingId(null);
    }
  }

  // Bulk actions
  function toggleSelectAll() {
    const selectableIds = filteredSubmissions.filter(s => s.status === "pending").map(s => s.id);
    if (selectedIds.size === selectableIds.length && selectableIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleBulkAction(status: "approved" | "rejected") {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const { error } = await supabase
        .from("photo_submissions")
        .update({ status } as any)
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast({ title: `${selectedIds.size} submission${selectedIds.size > 1 ? "s" : ""} ${status}` });
      setSelectedIds(new Set());
      fetchSubmissions();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Rejected</Badge>;
      case "revision":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">Revision</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getMetaStatusBadge(sub: PhotoSubmission) {
    if (!sub.meta_status || sub.meta_status === "not_uploaded") return null;
    if (sub.meta_status === "uploaded") {
      return (
        <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-[10px]">
          <Zap className="w-3 h-3 mr-1" /> On Meta
        </Badge>
      );
    }
    if (sub.meta_status === "error") {
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
          <AlertCircle className="w-3 h-3 mr-1" /> Error
        </Badge>
      );
    }
    return null;
  }

  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const approvedNotExported = submissions.filter(s => s.status === "approved" && (!s.meta_status || s.meta_status === "not_uploaded")).length;
  const selectableInFiltered = filteredSubmissions.filter(s => s.status === "pending").length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Camera className="w-6 h-6 text-primary" />
            Photo Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and approve creator photo submissions
            {pendingCount > 0 && (
              <span className="ml-2 text-warning font-medium">
                ({pendingCount} pending)
              </span>
            )}
            {approvedNotExported > 0 && metaConnected && (
              <span className="ml-2 text-primary font-medium">
                ({approvedNotExported} ready to export)
              </span>
            )}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="revision">Revision</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px]">
              <CalendarDays className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="last_2_weeks">Last 2 Weeks</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDirection(d => d === "newest" ? "oldest" : "newest")}
            className="gap-1.5"
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortDirection === "newest" ? "Newest" : "Oldest"}
          </Button>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-3 md:p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-primary" />
              <span className="font-medium text-sm">{selectedIds.size} selected</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="default" onClick={() => handleBulkAction("approved")} disabled={bulkActionLoading}>
                {bulkActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                Approve All
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleBulkAction("rejected")} disabled={bulkActionLoading}>
                <X className="w-4 h-4 mr-1" />
                Reject All
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Submissions Grid */}
        {loading ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-72 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="stat-card text-center py-16">
            <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No submissions found</h3>
            <p className="text-sm text-muted-foreground">
              {submissions.length === 0
                ? "Photos will appear here when creators submit them"
                : "Try adjusting your filters"}
            </p>
          </div>
        ) : (
          <>
            {/* Select All for pending */}
            {selectableInFiltered > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <Checkbox
                  checked={selectedIds.size === selectableInFiltered && selectableInFiltered > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  Select all ({selectableInFiltered})
                </span>
              </div>
            )}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredSubmissions.map((sub) => {
                const hasPhotos = sub.photo_urls.length > 0;
                const coverImage = sub.thumbnail_url || sub.photo_urls[0] || null;
                const isSelected = selectedIds.has(sub.id);

                return (
                  <div
                    key={sub.id}
                    className={`stat-card group transition-colors relative ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : "hover:border-primary/30"
                    }`}
                  >
                    {/* Selection checkbox for pending */}
                    {sub.status === "pending" && (
                      <div className="absolute top-2 left-2 z-10">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(sub.id)}
                          className="bg-background border-2"
                        />
                      </div>
                    )}

                    {/* Cover: side-by-side Story + Feed */}
                    <div
                      className="relative bg-muted rounded-lg overflow-hidden mb-4 cursor-pointer"
                      onClick={() => {
                        if (hasPhotos) openLightbox(sub.photo_urls);
                        else openReview(sub);
                      }}
                    >
                      {hasPhotos ? (
                        <div className="grid grid-cols-2 gap-1">
                          <div className="relative">
                            <img src={sub.photo_urls[0]} alt="Story" className="w-full aspect-[9/16] object-cover" loading="lazy" />
                            <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">9:16</span>
                          </div>
                          {sub.photo_urls[1] ? (
                            <div className="relative">
                              <img src={sub.photo_urls[1]} alt="Feed" className="w-full aspect-[9/16] object-cover" loading="lazy" />
                              <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">Feed</span>
                            </div>
                          ) : (
                            <div className="w-full aspect-[9/16] flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full aspect-video flex items-center justify-center">
                          <ImageIcon className="w-10 h-10 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Meta status + review status badges */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {getStatusBadge(sub.status)}
                      {getMetaStatusBadge(sub)}
                    </div>

                    {/* Info */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold truncate">{sub.creative_name || sub.title || "Untitled"}</h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {sub.creator_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{sub.creator_name}</span>
                      </div>

                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                      </div>

                      {/* Actions */}
                      {sub.status === "pending" && (
                        <div className="space-y-2 pt-2 border-t">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="flex-1"
                              onClick={() => openReview(sub)}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="flex-1"
                              onClick={() => {
                                openReview(sub);
                              }}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Review
                            </Button>
                          </div>
                        </div>
                      )}

                      {sub.status === "approved" && (
                        <div className="pt-2 border-t space-y-2">
                          {metaConnected && (
                            <>
                              {sub.meta_status === "error" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleExportToMeta(sub)}
                                  disabled={exportingId === sub.id}
                                >
                                  {exportingId === sub.id ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                  )}
                                  Retry Export
                                </Button>
                              ) : !sub.meta_status || sub.meta_status === "not_uploaded" ? (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="w-full bg-[#1877F2] hover:bg-[#166FE5]"
                                  onClick={() => handleExportToMeta(sub)}
                                  disabled={exportingId === sub.id}
                                >
                                  {exportingId === sub.id ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Upload className="w-4 h-4 mr-2" />
                                  )}
                                  Export to Meta
                                </Button>
                              ) : (
                                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                  <Zap className="w-4 h-4 text-success" />
                                  <span>Exported to Meta</span>
                                </div>
                              )}
                            </>
                          )}
                          {/* Download button */}
                          {sub.photo_urls.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => {
                                sub.photo_urls.forEach((url, i) => {
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `${sub.title || "photo"}_${i + 1}`;
                                  a.target = "_blank";
                                  a.click();
                                });
                              }}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download Photos
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            <img
              src={lightboxPhotos[lightboxIndex]}
              alt={`Photo ${lightboxIndex + 1}`}
              className="max-w-full max-h-[90vh] object-contain"
            />

            {lightboxPhotos.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIndex(i => (i > 0 ? i - 1 : lightboxPhotos.length - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 rounded-full p-2"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={() => setLightboxIndex(i => (i < lightboxPhotos.length - 1 ? i + 1 : 0))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 rounded-full p-2"
                >
                  <ChevronRight className="w-6 h-6 text-white" />
                </button>
              </>
            )}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
              {lightboxIndex + 1} / {lightboxPhotos.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Modal with Navigation */}
      <Dialog open={reviewOpen} onOpenChange={(open) => { if (!open) setReviewIndex(null); }}>
        <DialogContent
          className="max-w-3xl bg-background/95 backdrop-blur-md border-border/50"
          onPointerDown={(e) => { touchStartX.current = e.clientX; }}
          onPointerUp={(e) => {
            if (touchStartX.current === null) return;
            const diff = e.clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(diff) < 60) return;
            if (diff > 0 && reviewIndex !== null && reviewIndex > 0) setReviewIndex(reviewIndex - 1);
            if (diff < 0 && reviewIndex !== null && reviewIndex < filteredSubmissions.length - 1) setReviewIndex(reviewIndex + 1);
          }}
        >
          {/* Navigation header */}
          <div className="flex items-center justify-between -mt-2 mb-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={reviewIndex === null || reviewIndex <= 0}
              onClick={() => reviewIndex !== null && setReviewIndex(reviewIndex - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              {reviewIndex !== null ? reviewIndex + 1 : 0} of {filteredSubmissions.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={reviewIndex === null || reviewIndex >= filteredSubmissions.length - 1}
              onClick={() => reviewIndex !== null && setReviewIndex(reviewIndex + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <DialogHeader>
            <DialogTitle>{selectedSubmission?.creative_name || selectedSubmission?.title || "Photo Submission"}</DialogTitle>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {selectedSubmission.creator_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{selectedSubmission.creator_name}</span>
                </div>
                <div className="flex items-center justify-end">{getStatusBadge(selectedSubmission.status)}</div>
                {selectedSubmission.bounty_title && (
                  <div className="col-span-2"><strong>Bounty:</strong> {selectedSubmission.bounty_title}</div>
                )}
              </div>

              {/* Side-by-side Story + Feed */}
              {selectedSubmission.photo_urls.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2">Creative Photos</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">9:16 Story</span>
                      <img
                        src={selectedSubmission.photo_urls[0]}
                        alt="Story version"
                        className="w-full aspect-[9/16] rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => openLightbox(selectedSubmission.photo_urls, 0)}
                      />
                    </div>
                    {selectedSubmission.photo_urls[1] && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-muted-foreground">Feed Post</span>
                        <img
                          src={selectedSubmission.photo_urls[1]}
                          alt="Feed version"
                          className="w-full aspect-[4/5] rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => openLightbox(selectedSubmission.photo_urls, 1)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedSubmission.link_url && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium mb-1">External Link</p>
                  <a
                    href={selectedSubmission.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline break-all"
                  >
                    {selectedSubmission.link_url}
                  </a>
                </div>
              )}

              {selectedSubmission.notes && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium mb-1">Creator Notes</p>
                  <p className="text-sm">{selectedSubmission.notes}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium mb-1">Admin Notes</p>
                <Textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Optional feedback notes..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {selectedSubmission?.status === "approved" && selectedSubmission?.photo_urls?.length > 0 && metaConnected && (
              <Button
                variant="outline"
                onClick={() => handleExportToMeta(selectedSubmission)}
                disabled={actionLoading || selectedSubmission?.meta_status === "uploaded"}
                size="sm"
                className="bg-[#1877F2] hover:bg-[#166FE5] text-white border-none"
              >
                <Upload className="w-4 h-4 mr-1" />
                {selectedSubmission?.meta_status === "uploaded" ? "Exported" : "Export to Meta"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => handleAction("revision")}
              disabled={actionLoading}
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Revision
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleAction("rejected")}
              disabled={actionLoading}
              size="sm"
            >
              <X className="w-4 h-4 mr-1" /> Reject
            </Button>
            <Button
              onClick={() => handleAction("approved")}
              disabled={actionLoading}
              size="sm"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
