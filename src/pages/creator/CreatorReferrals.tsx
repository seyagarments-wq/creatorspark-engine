import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Copy,
  Gift,
  CheckCircle,
  Clock,
  DollarSign,
  Link,
  Share2,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Referral {
  id: string;
  referee_email: string;
  status: string;
  bonus_amount: number;
  bonus_paid: boolean;
  created_at: string;
}

export default function CreatorReferrals() {
  const { profileId, user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const referralCode = user?.id?.slice(0, 8) ?? "";
  const referralLink = `https://creatorscrtl.lovable.app/referral-signup?ref=${referralCode}`;

  useEffect(() => {
    if (profileId) fetchReferrals();
  }, [profileId]);

  async function fetchReferrals() {
    try {
      const { data, error } = await supabase
        .from("referrals" as any)
        .select("*")
        .eq("referrer_id", profileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReferrals((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching referrals:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendInvite() {
    if (!inviteEmail.trim() || !profileId) return;
    if (!inviteEmail.includes("@")) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Check not already referred
      const { data: existing } = await supabase
        .from("referrals" as any)
        .select("id")
        .eq("referrer_id", profileId)
        .eq("referee_email", inviteEmail.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        toast({ title: "Already invited", description: "You've already referred this email." });
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from("referrals" as any).insert({
        referrer_id: profileId,
        referee_email: inviteEmail.trim().toLowerCase(),
        status: "pending",
        bonus_amount: 25,
      });
      if (error) throw error;

      toast({
        title: "Invite sent! 🎉",
        description: `${inviteEmail} will earn you $25 when they get approved.`,
      });
      setInviteEmail("");
      fetchReferrals();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(referralLink);
    toast({ title: "Link copied!", description: "Share it with a friend." });
  }

  const stats = {
    total: referrals.length,
    approved: referrals.filter(r => r.status === "approved").length,
    earned: referrals.filter(r => r.bonus_paid).reduce((s, r) => s + r.bonus_amount, 0),
    pending: referrals.filter(r => r.status === "pending").length,
  };

  function getStatusBadge(status: string, paid: boolean) {
    if (status === "approved" && paid)
      return <Badge className="bg-success/10 text-success gap-1"><CheckCircle className="w-3 h-3" /> Paid</Badge>;
    if (status === "approved")
      return <Badge className="bg-info/10 text-info gap-1"><CheckCircle className="w-3 h-3" /> Approved</Badge>;
    return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
  }

  return (
    <CreatorLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-3 rounded-xl bg-primary/10">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Refer a Creator</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Earn $25 for every creator you invite who gets approved
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="stat-card">
            <div className="flex flex-col items-center md:flex-row md:items-center gap-1 md:gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-xl md:text-2xl font-bold">{stats.total}</p>
                <p className="text-[10px] md:text-sm text-muted-foreground">Invited</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex flex-col items-center md:flex-row md:items-center gap-1 md:gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle className="w-4 h-4 text-success" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-xl md:text-2xl font-bold">{stats.approved}</p>
                <p className="text-[10px] md:text-sm text-muted-foreground">Approved</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex flex-col items-center md:flex-row md:items-center gap-1 md:gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <DollarSign className="w-4 h-4 text-warning" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-xl md:text-2xl font-bold">${stats.earned}</p>
                <p className="text-[10px] md:text-sm text-muted-foreground">Earned</p>
              </div>
            </div>
          </div>
        </div>

        {/* Invite card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Gift className="w-5 h-5 text-primary" />
              Invite a Creator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email invite */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">Enter their email to track the referral:</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="friend@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendInvite()}
                  className="flex-1"
                />
                <Button variant="success" onClick={handleSendInvite} disabled={submitting || !inviteEmail.trim()}>
                  {isMobile ? <Share2 className="w-4 h-4" /> : "Send Invite"}
                </Button>
              </div>
            </div>

            {/* Referral link */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">Or share your referral link:</p>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg border text-sm truncate">
                  <Link className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate text-muted-foreground">{referralLink}</span>
                </div>
                <Button variant="outline" onClick={copyLink} size="icon">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* How it works */}
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 text-sm">
              <p className="font-medium mb-1">How it works:</p>
              <ol className="text-muted-foreground space-y-0.5 list-decimal ml-4">
                <li>Enter your friend's email or share your link</li>
                <li>They sign up and submit their first video</li>
                <li>Once their video gets approved, you earn <strong className="text-foreground">$25</strong></li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Referrals list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg">Your Referrals</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />)}
              </div>
            ) : referrals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No referrals yet. Start inviting!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {referrals.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.referee_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.status === "approved" && (
                        <span className="text-sm font-semibold text-success">+${r.bonus_amount}</span>
                      )}
                      {getStatusBadge(r.status, r.bonus_paid)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CreatorLayout>
  );
}
