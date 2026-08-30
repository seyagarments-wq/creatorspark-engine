import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  Clock,
  Instagram,
  Video,
  Mail,
  User,
  Phone,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface ReferralApplication {
  id: string;
  referrer_id: string | null;
  full_name: string;
  email: string;
  phone_number: string | null;
  instagram_handle: string;
  sample_video_url: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  referrer?: { full_name: string } | null;
}

export default function ReferralApplicationsPanel() {
  const { profileId } = useAuth();
  const { toast } = useToast();
  const [applications, setApplications] = useState<ReferralApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [rejectDialog, setRejectDialog] = useState<ReferralApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications();
  }, [filter]);

  async function fetchApplications() {
    setLoading(true);
    try {
      let query = supabase
        .from("referral_applications" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const apps = (data as any[]) || [];
      const referrerIds = [...new Set(apps.filter((a) => a.referrer_id).map((a) => a.referrer_id))];
      let referrerMap: Record<string, string> = {};
      if (referrerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", referrerIds);
        for (const p of profiles || []) {
          referrerMap[p.id] = p.full_name;
        }
      }

      setApplications(
        apps.map((a) => ({
          ...a,
          referrer: a.referrer_id ? { full_name: referrerMap[a.referrer_id] ?? "Unknown" } : null,
        }))
      );
    } catch (err) {
      console.error("Error fetching applications:", err);
    } finally {
      setLoading(false);
    }
  }

  async function sendApprovalEmail(app: ReferralApplication) {
    try {
      const { error } = await supabase.functions.invoke("send-referral-email", {
        body: {
          to: app.email,
          subject: "🎉 You've been approved — Welcome to Creators Control!",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
              <h2 style="color:#111;">Hey ${app.full_name}, you're in! 🎉</h2>
              <p style="color:#444;">Congratulations — your creator application has been <strong>approved</strong>.</p>
              <p style="color:#444;">Here's what to do next:</p>
              <ol style="color:#444; line-height:1.8;">
                <li>Sign in to your account at <a href="https://creatorsctrl.com/auth" style="color:#6366f1;">creatorsctrl.com</a></li>
                <li>Complete your profile setup</li>
                <li>Connect your Stripe account to receive payouts</li>
                <li>Request your free product sample</li>
                <li>Start creating and earning!</li>
              </ol>
              <p style="margin-top:24px;">
                <a href="https://creatorsctrl.com/auth" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Sign In &amp; Get Started</a>
              </p>
              <p style="color:#888;font-size:13px;margin-top:32px;">If you have any questions, reach out to us via the in-app chat. We're excited to have you on board!</p>
            </div>
          `,
        },
      });
      if (error) console.error("Approval email error:", error);
    } catch (err) {
      console.error("Approval email error:", err);
    }
  }

  async function sendRejectionEmail(app: ReferralApplication, reason: string) {
    try {
      const { error } = await supabase.functions.invoke("send-referral-email", {
        body: {
          to: app.email,
          subject: "Your Creators Control application status",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
              <h2 style="color:#111;">Hi ${app.full_name},</h2>
              <p style="color:#444;">Thank you for applying to join Creators Control. After reviewing your application, we're unable to move forward at this time.</p>
              ${reason ? `<p style="color:#444;"><strong>Reason:</strong> ${reason}</p>` : ""}
              <p style="color:#444;">We appreciate your interest and encourage you to apply again in the future as you grow your content.</p>
              <p style="color:#888;font-size:13px;margin-top:32px;">The Creators Control Team</p>
            </div>
          `,
        },
      });
      if (error) console.error("Rejection email error:", error);
    } catch (err) {
      console.error("Rejection email error:", err);
    }
  }

  async function handleApprove(app: ReferralApplication) {
    setProcessing(app.id);
    try {
      // 1) Update application status
      const { error } = await supabase
        .from("referral_applications" as any)
        .update({ status: "approved", reviewed_by: profileId, reviewed_at: new Date().toISOString() })
        .eq("id", app.id);
      if (error) throw error;

      // 2) Create auth account, profile, role, and send welcome email via edge function
      const { data: accountData, error: accountError } = await supabase.functions.invoke("create-creator-account", {
        body: {
          email: app.email,
          full_name: app.full_name,
          instagram_handle: app.instagram_handle,
          referrer_id: app.referrer_id,
          application_id: app.id,
        },
      });

      if (accountError) {
        console.error("Account creation error:", accountError);
        // Still send approval email as fallback
        await sendApprovalEmail(app);
      }

      // 3) Update the referral row status and notify referrer
      if (app.referrer_id) {
        const { data: referralRow } = await supabase
          .from("referrals")
          .select("id")
          .eq("referrer_id", app.referrer_id)
          .eq("referee_email", app.email)
          .maybeSingle();

        if (referralRow) {
          await supabase
            .from("referrals")
            .update({ status: "approved" })
            .eq("id", referralRow.id);

          const { data: referrerProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("id", app.referrer_id)
            .single();

          if (referrerProfile?.user_id) {
            await supabase.from("notifications").insert({
              user_id: referrerProfile.user_id,
              title: "Your referral was approved! 🎉",
              message: `${app.full_name} was approved through your referral link. Your $25 bonus will be paid out soon.`,
              notification_type: "general",
              link: "/creator/referrals",
            });
          }
        }
      }

      toast({ title: "Application approved ✓", description: `Account created and welcome email sent to ${app.email}.` });
      setApplications((prev) => prev.map((a) => a.id === app.id ? { ...a, status: "approved" } : a));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject() {
    if (!rejectDialog) return;
    setProcessing(rejectDialog.id);
    try {
      const { error } = await supabase
        .from("referral_applications" as any)
        .update({
          status: "rejected",
          rejection_reason: rejectionReason.trim() || null,
          reviewed_by: profileId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", rejectDialog.id);
      if (error) throw error;

      // Send rejection email
      await sendRejectionEmail(rejectDialog, rejectionReason.trim());

      toast({ title: "Application rejected", description: `Rejection email sent to ${rejectDialog.email}.` });
      setApplications((prev) =>
        prev.map((a) =>
          a.id === rejectDialog.id ? { ...a, status: "rejected", rejection_reason: rejectionReason } : a
        )
      );
      setRejectDialog(null);
      setRejectionReason("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  const pendingCount = applications.filter((a) => a.status === "pending").length;

  function getStatusBadge(status: string) {
    switch (status) {
      case "approved":
        return <Badge className="bg-success/10 text-success gap-1"><CheckCircle className="w-3 h-3" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1 bg-destructive/10 text-destructive"><XCircle className="w-3 h-3" /> Rejected</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Referral Applications</h2>
        <div className="flex gap-2 flex-wrap">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f === "pending" && pendingCount > 0 ? (
                <span className="flex items-center gap-1">
                  Pending <Badge className="ml-1 h-4 px-1 text-[10px]">{pendingCount}</Badge>
                </span>
              ) : f}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No {filter === "all" ? "" : filter} applications yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card key={app.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{app.full_name}</p>
                      {getStatusBadge(app.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> {app.email}
                      </span>
                      {app.phone_number && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" /> {app.phone_number}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Instagram className="w-3.5 h-3.5" /> @{app.instagram_handle}
                      </span>
                    </div>
                    {app.sample_video_url.includes('/storage/v1/object/public/application-videos/') ? (
                      <div className="mt-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <Video className="w-3.5 h-3.5" /> Uploaded video:
                        </p>
                        <video
                          src={app.sample_video_url}
                          controls
                          className="w-full max-h-48 rounded-lg bg-muted"
                        />
                      </div>
                    ) : (
                      <a
                        href={app.sample_video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Video className="w-3.5 h-3.5" /> View Sample Video
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {app.referrer && (
                      <p className="text-xs text-muted-foreground">
                        Referred by: <span className="font-medium text-foreground">{app.referrer.full_name}</span>
                      </p>
                    )}
                    {app.rejection_reason && (
                      <p className="text-xs text-destructive">Reason: {app.rejection_reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Applied {new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>

                  {app.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => handleApprove(app)}
                        disabled={processing === app.id}
                      >
                        {processing === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setRejectDialog(app)}
                        disabled={processing === app.id}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!rejectDialog} onOpenChange={(o) => { if (!o) { setRejectDialog(null); setRejectionReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Rejecting <strong>{rejectDialog?.full_name}</strong>'s application. An email will be sent to them.
          </p>
          <Textarea
            placeholder="Reason for rejection (optional — will be included in the email)..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectionReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!!processing}
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Reject & Email Applicant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
