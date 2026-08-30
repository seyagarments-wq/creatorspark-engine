import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, ExternalLink, Check, X, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const EXCLUSIVE_BOUNTY_REJECTION =
  "This is an exclusive bounty. In order to participate, you would've needed to plan out the shoot with us beforehand — we had very specific concepts and locations in mind. Only creators who were directly invited and pre-coordinated with the team are eligible.";

interface PhotoSubmission {
  id: string;
  bounty_id: string;
  creator_id: string;
  link_url: string;
  edited_count: number;
  raw_count: number;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  creator_name: string;
  bounty_title: string;
}

export default function AdminPhotoSubmissions() {
  const [submissions, setSubmissions] = useState<PhotoSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewDialog, setReviewDialog] = useState(false);
  const [selected, setSelected] = useState<PhotoSubmission | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubmissions();
  }, []);

  async function fetchSubmissions() {
    try {
      const { data, error } = await supabase
        .from("photo_submissions")
        .select("*, profiles:creator_id(full_name), bounties:bounty_id(title)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((s: any) => ({
        ...s,
        creator_name: s.profiles?.full_name || "Unknown",
        bounty_title: s.bounties?.title || "Unknown Bounty",
      }));

      setSubmissions(formatted);
    } catch (err) {
      console.error("Error fetching photo submissions:", err);
    } finally {
      setLoading(false);
    }
  }

  function openReview(sub: PhotoSubmission) {
    setSelected(sub);
    setAdminNotes(sub.admin_notes || "");
    setReviewDialog(true);
  }

  async function handleAction(status: "approved" | "rejected") {
    if (!selected) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("photo_submissions")
        .update({ status, admin_notes: adminNotes.trim() || null })
        .eq("id", selected.id);

      if (error) throw error;

      if (status === "approved") {
        const { data: existingCb } = await supabase
          .from("creator_bounties")
          .select("id")
          .eq("bounty_id", selected.bounty_id)
          .eq("creator_id", selected.creator_id)
          .maybeSingle();

        if (existingCb) {
          await supabase
            .from("creator_bounties")
            .update({ qualified: true, qualified_at: new Date().toISOString() })
            .eq("id", existingCb.id);
        } else {
          await supabase.from("creator_bounties").insert({
            bounty_id: selected.bounty_id,
            creator_id: selected.creator_id,
            qualified: true,
            qualified_at: new Date().toISOString(),
          });
        }
      }

      if (status === "rejected") {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("id", selected.creator_id)
            .single();

          if (profile?.user_id) {
            const rejectionReason = adminNotes.trim() || "Your submission did not meet the requirements for this bounty.";
            await supabase.functions.invoke("send-notification-email", {
              body: {
                user_id: profile.user_id,
                title: "Your photo submission was rejected.",
                message: `Your photo submission for "${selected.bounty_title}" was not approved.\n\n${rejectionReason}\n\nIf you have questions, message us in the app.`,
                notification_type: "bounty",
                link: "/creator/bounties",
                button_text: "View Bounties",
              },
            });
          }
        } catch (notifyErr) {
          console.error("Error sending rejection notification:", notifyErr);
        }
      }

      toast({
        title: status === "approved" ? "Submission Approved ✅" : "Submission Rejected",
        description: status === "approved"
          ? "Photo submission approved and bounty qualified."
          : "Photo submission rejected and creator notified.",
      });

      setReviewDialog(false);
      fetchSubmissions();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  function handleRejectClick() {
    if (!adminNotes.trim()) {
      setAdminNotes(EXCLUSIVE_BOUNTY_REJECTION);
    }
    handleAction("rejected");
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-600";
      case "rejected": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Camera className="w-6 h-6 text-primary" />
            Photo Submissions
          </h1>
          <p className="text-sm text-muted-foreground">Review photo bounty submissions from creators</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : submissions.length === 0 ? (
          <Card className="p-8 text-center">
            <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Photo Submissions Yet</h3>
            <p className="text-sm text-muted-foreground">Photo submissions will appear here when creators submit them.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => (
              <Card
                key={sub.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => openReview(sub)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs">{sub.creator_name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{sub.creator_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{sub.bounty_title}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right text-xs text-muted-foreground hidden md:block">
                        <p>{sub.edited_count} edited · {sub.raw_count} raw</p>
                        <p className="flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge className={statusColor(sub.status)}>
                        {sub.status === "pending" ? "Pending" : sub.status === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Photo Submission</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm"><strong>Creator:</strong> {selected.creator_name}</p>
                <p className="text-sm"><strong>Bounty:</strong> {selected.bounty_title}</p>
                <p className="text-sm"><strong>Photos:</strong> {selected.edited_count} edited, {selected.raw_count} raw</p>
                <p className="text-sm"><strong>Submitted:</strong> {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}</p>
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium mb-1">File Transfer Link</p>
                <a
                  href={selected.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                  {selected.link_url}
                </a>
              </div>

              {selected.notes && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium mb-1">Creator Notes</p>
                  <p className="text-sm">{selected.notes}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium">Admin Notes</p>
                  {!adminNotes.trim() && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setAdminNotes(EXCLUSIVE_BOUNTY_REJECTION)}
                    >
                      Use exclusive bounty template
                    </button>
                  )}
                </div>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={handleRejectClick}
              disabled={actionLoading}
              size="sm"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <X className="w-4 h-4 mr-1" />}
              Reject
            </Button>
            <Button
              onClick={() => handleAction("approved")}
              disabled={actionLoading}
              size="sm"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              Approve & Qualify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
