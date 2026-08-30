import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trophy, Target, Clock, DollarSign, Star, CheckCircle2, Zap, ChevronRight, Camera, Send, Loader2, ExternalLink } from "lucide-react";
import { CountdownTimer } from "@/components/bounties/CountdownTimer";
import { MilestoneCelebration } from "@/components/MilestoneCelebration";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface Bounty {
  id: string;
  title: string;
  description: string | null;
  milestone_type: string;
  milestone_value: number;
  reward_amount: number;
  time_limit_days: number | null;
  expires_at: string | null;
  status: string;
  created_at: string;
  cohort_id: string | null;
}

interface CreatorBounty {
  id: string;
  bounty_id: string;
  qualified: boolean;
  qualified_at: string | null;
  payout_approved: boolean;
}

interface BountyWithProgress extends Bounty {
  creatorProgress?: CreatorBounty;
  currentValue: number;
}

export default function CreatorBounties() {
  const isMobile = useIsMobile();
  const { profileId, user } = useAuth();
  const [bounties, setBounties] = useState<BountyWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorProfile, setCreatorProfile] = useState<{ avatar_url: string | null; stripe_onboarding_complete: boolean | null } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebratedBounty, setCelebratedBounty] = useState<string | null>(null);
  const [selectedBounty, setSelectedBounty] = useState<BountyWithProgress | null>(null);
  const [stats, setStats] = useState({
    totalEarned: 0,
    activeCount: 0,
    completedCount: 0,
  });
  // Photo submission state
  const [photoLink, setPhotoLink] = useState("");
  const [photoNotes, setPhotoNotes] = useState("");
  const [photoEditedCount, setPhotoEditedCount] = useState(5);
  const [photoRawCount, setPhotoRawCount] = useState(20);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [photoSubmissions, setPhotoSubmissions] = useState<Record<string, { link_url: string; status: string; edited_count: number; raw_count: number }>>({});

  // Auto-qualification check
  const checkAndQualify = useCallback(async (bounty: BountyWithProgress) => {
    if (!profileId || !user || bounty.creatorProgress?.qualified) return;
    
    if (bounty.currentValue >= bounty.milestone_value) {
      const deadline = bounty.expires_at
        ? new Date(bounty.expires_at)
        : bounty.time_limit_days
        ? new Date(new Date(bounty.created_at).getTime() + bounty.time_limit_days * 24 * 60 * 60 * 1000)
        : null;
      if (deadline && new Date() > deadline) return;

      const { data: existingRecord } = await supabase
        .from("creator_bounties")
        .select("id, qualified")
        .eq("bounty_id", bounty.id)
        .eq("creator_id", profileId)
        .is("video_id", null)
        .single();

      if (existingRecord?.qualified) return;

      let error;
      if (existingRecord) {
        const result = await supabase
          .from("creator_bounties")
          .update({
            qualified: true,
            qualified_at: new Date().toISOString(),
          })
          .eq("id", existingRecord.id);
        error = result.error;
      } else {
        const result = await supabase
          .from("creator_bounties")
          .insert({
            bounty_id: bounty.id,
            creator_id: profileId,
            video_id: null,
            qualified: true,
            qualified_at: new Date().toISOString(),
          });
        error = result.error;
      }

      if (!error) {
        setCelebratedBounty(bounty.title);
        setShowCelebration(true);
        toast.success(`🎉 You qualified for "${bounty.title}"!`);
        
        try {
          await supabase.functions.invoke("send-notification-email", {
            body: {
              user_id: user.id,
              title: "🎉 You've qualified for a bounty!",
              message: `Congratulations! You've met the milestone for "${bounty.title}" and earned a $${Number(bounty.reward_amount).toFixed(2)} reward! Your payout will be processed once approved.`,
              notification_type: "bounty",
              link: "/creator/bounties",
            },
          });
        } catch (emailError) {
          console.error("Failed to send qualification email:", emailError);
        }
        
        fetchBounties();
      }
    }
  }, [profileId, user]);

  async function handlePhotoSubmit(bountyId: string) {
    if (!profileId || !photoLink.trim()) return;
    setPhotoSubmitting(true);
    try {
      const { error } = await supabase.from("photo_submissions").insert({
        bounty_id: bountyId,
        creator_id: profileId,
        link_url: photoLink.trim(),
        edited_count: photoEditedCount,
        raw_count: photoRawCount,
        notes: photoNotes.trim() || null,
      });
      if (error) throw error;
      toast.success("Photos submitted! We'll review them shortly 📸");
      setPhotoLink("");
      setPhotoNotes("");
      setPhotoEditedCount(5);
      setPhotoRawCount(20);
      setSelectedBounty(null);
      fetchBounties();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit");
    } finally {
      setPhotoSubmitting(false);
    }
  }

  useEffect(() => {
    if (profileId) {
      fetchBounties();
    }
  }, [profileId]);

  async function fetchBounties() {
    try {
      const [
        { data: allBounties },
        { data: creatorBounties },
        { data: performanceData },
        { data: approvedVideos },
        { data: profile },
        { data: cohortMemberships },
        { data: photoSubs },
      ] = await Promise.all([
        supabase.from("bounties").select("*").eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("creator_bounties").select("*").eq("creator_id", profileId),
        supabase.from("performance_data").select("purchases, revenue, impressions, video_id"),
        supabase.from("videos").select("id, bounty_id").eq("creator_id", profileId).eq("status", "approved"),
        supabase.from("profiles").select("avatar_url, stripe_onboarding_complete").eq("id", profileId).single(),
        supabase.from("creator_cohort_members").select("cohort_id").eq("creator_id", profileId),
        supabase.from("photo_submissions").select("bounty_id, link_url, status, edited_count, raw_count").eq("creator_id", profileId),
      ]);

      if (profile) setCreatorProfile(profile);

      // Build photo submissions map
      const photoSubsMap: Record<string, { link_url: string; status: string; edited_count: number; raw_count: number }> = {};
      (photoSubs || []).forEach((ps: any) => {
        photoSubsMap[ps.bounty_id] = { link_url: ps.link_url, status: ps.status, edited_count: ps.edited_count, raw_count: ps.raw_count };
      });
      setPhotoSubmissions(photoSubsMap);

      const myCohortIds = new Set(cohortMemberships?.map(m => m.cohort_id) || []);

      const totals = performanceData?.reduce(
        (acc, p) => ({
          purchases: acc.purchases + (p.purchases || 0),
          revenue: acc.revenue + Number(p.revenue || 0),
          impressions: acc.impressions + Number(p.impressions || 0),
        }),
        { purchases: 0, revenue: 0, impressions: 0 }
      ) || { purchases: 0, revenue: 0, impressions: 0 };

      // Filter out cohort-exclusive bounties the creator isn't part of
      const visibleBounties = (allBounties || []).filter((bounty: any) => {
        if (!bounty.cohort_id) return true;
        return myCohortIds.has(bounty.cohort_id);
      });

      const bountiesWithProgress: BountyWithProgress[] = visibleBounties.map((bounty) => {
        const progress = creatorBounties?.find((cb) => cb.bounty_id === bounty.id);
        let currentValue = 0;

        switch (bounty.milestone_type) {
          case "approved_uploads":
            currentValue = approvedVideos?.filter((v: any) => v.bounty_id === bounty.id).length || 0;
            break;
          case "sales":
            currentValue = totals.purchases;
            break;
          case "revenue":
            currentValue = totals.revenue;
            break;
          case "impressions":
            currentValue = totals.impressions;
            break;
          case "profile_complete":
            currentValue = (profile?.avatar_url && profile?.stripe_onboarding_complete) ? 1 : 0;
            break;
          case "referrals":
            currentValue = progress?.qualified ? bounty.milestone_value : 0;
            break;
          case "photo_submission": {
            const sub = photoSubsMap[bounty.id];
            currentValue = sub ? 1 : 0;
            break;
          }
          default:
            currentValue = 0;
        }

        return {
          ...bounty,
          creatorProgress: progress,
          currentValue,
        };
      });

      setBounties(bountiesWithProgress);

      const completed = bountiesWithProgress.filter((b) => b.creatorProgress?.qualified);
      const earned = completed
        .filter((b) => b.creatorProgress?.payout_approved)
        .reduce((sum, b) => sum + Number(b.reward_amount), 0);

      bountiesWithProgress.forEach((bounty) => {
        if (!bounty.creatorProgress?.qualified && bounty.currentValue >= bounty.milestone_value) {
          checkAndQualify(bounty);
        }
      });

      setStats({
        totalEarned: earned,
        activeCount: bountiesWithProgress.length,
        completedCount: completed.length,
      });
    } catch (error) {
      console.error("Error fetching bounties:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  function getMilestoneLabel(type: string) {
    switch (type) {
      case "approved_uploads": return "Approved Uploads";
      case "sales": return "Sales (Approved Videos)";
      case "revenue": return "Revenue (Approved Videos)";
      case "impressions": return "Impressions (Approved Videos)";
      case "views": return "Views (Approved Videos)";
      case "profile_complete": return "Profile Setup";
      case "referrals": return "Friends Invited (Admin Verified)";
      case "photo_submission": return "Photo Submission";
      default: return type;
    }
  }

  function getProgressPercentage(bounty: BountyWithProgress) {
    if (bounty.creatorProgress?.qualified) return 100;
    return Math.min(100, (bounty.currentValue / bounty.milestone_value) * 100);
  }

  function getDeadline(bounty: BountyWithProgress): Date | null {
    if (bounty.expires_at) return new Date(bounty.expires_at);
    if (bounty.time_limit_days) {
      const start = new Date(bounty.created_at);
      return new Date(start.getTime() + bounty.time_limit_days * 24 * 60 * 60 * 1000);
    }
    return null;
  }

  if (loading) {
    return (
      <CreatorLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      {/* Celebration overlay */}
      <MilestoneCelebration
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
        title="Bounty Qualified!"
        subtitle={`You've qualified for "${celebratedBounty}"`}
      />

      <div className="space-y-4 md:space-y-6 animate-fade-in pb-24 md:pb-0">
        {/* Header */}
        <div>
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            Rewards & Bounties
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
            Complete challenges to earn bonus rewards
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <Card>
            <CardContent className="p-3 md:p-4 flex flex-col md:flex-row items-center gap-2 md:gap-4">
              <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-success/10 flex items-center justify-center">
                <DollarSign className="w-4 h-4 md:w-6 md:h-6 text-success" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-[10px] md:text-sm text-muted-foreground">Earned</p>
                <p className="text-sm md:text-2xl font-bold">{formatCurrency(stats.totalEarned)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-4 flex flex-col md:flex-row items-center gap-2 md:gap-4">
              <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="w-4 h-4 md:w-6 md:h-6 text-primary" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-[10px] md:text-sm text-muted-foreground">Active</p>
                <p className="text-sm md:text-2xl font-bold">{stats.activeCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-4 flex flex-col md:flex-row items-center gap-2 md:gap-4">
              <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Star className="w-4 h-4 md:w-6 md:h-6 text-amber-500" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-[10px] md:text-sm text-muted-foreground">Done</p>
                <p className="text-sm md:text-2xl font-bold">{stats.completedCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bounties List */}
        {bounties.length === 0 ? (
          <Card className="p-6 md:p-8 text-center">
            <Trophy className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-3 md:mb-4" />
            <h3 className="text-base md:text-lg font-semibold mb-2">No Active Bounties</h3>
            <p className="text-xs md:text-sm text-muted-foreground">
              Check back later for new reward opportunities!
            </p>
          </Card>
        ) : (
          <div className="space-y-2 md:grid md:gap-4 md:grid-cols-2 md:space-y-0">
            {bounties.map((bounty) => {
              const progress = getProgressPercentage(bounty);
              const isCompleted = bounty.creatorProgress?.qualified;
              const isPaid = bounty.creatorProgress?.payout_approved;
              const deadline = getDeadline(bounty);

              return (
                <div key={bounty.id}>
                  {/* ── MOBILE: compact tappable row (uniform height) ── */}
                  <Card
                    className={`md:hidden cursor-pointer active:opacity-75 transition-opacity ${isCompleted ? "border-success/50 bg-success/5" : ""}`}
                    onClick={() => setSelectedBounty(bounty)}
                  >
                    <CardContent className="p-3 flex flex-col justify-between h-[88px]">
                      {/* Row 1: title + badge + chevron */}
                       <div className="flex items-center gap-2">
                         <span className="text-sm font-semibold truncate flex-1">{bounty.title}</span>
                         {bounty.milestone_type === "photo_submission" && !isCompleted && !photoSubmissions[bounty.id] && (
                           <span className="text-[10px] text-primary font-medium flex items-center gap-0.5 shrink-0">
                             <Camera className="w-3 h-3" /> Submit
                           </span>
                         )}
                         {bounty.cohort_id && (
                           <Badge variant="outline" className="text-[9px] border-primary text-primary shrink-0">EXCLUSIVE</Badge>
                         )}
                         <Badge
                           variant={isPaid ? "default" : isCompleted ? "outline" : "secondary"}
                           className={`${isPaid ? "bg-green-600" : ""} text-[10px] shrink-0`}
                         >
                           {isPaid ? "Paid" : isCompleted ? "Qualified" : "Active"}
                         </Badge>
                         <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                       </div>

                      {/* Row 2: thin progress bar */}
                      <Progress value={progress} className="h-1" />

                      {/* Row 3: reward + time remaining */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-primary">
                          {formatCurrency(Number(bounty.reward_amount))}
                        </span>
                        {deadline && !isCompleted ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3 shrink-0" />
                            <CountdownTimer endDate={deadline} />
                          </div>
                        ) : isCompleted ? (
                          <span className="text-[11px] text-success font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Complete
                          </span>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── DESKTOP: clickable full card ── */}
                  <Card
                    className={`hidden md:block cursor-pointer hover:border-primary/40 transition-colors ${isCompleted ? "border-success/50 bg-success/5" : ""}`}
                    onClick={() => setSelectedBounty(bounty)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                             <span className="truncate">{bounty.title}</span>
                             {bounty.cohort_id && (
                               <Badge variant="outline" className="text-[10px] border-primary text-primary shrink-0">EXCLUSIVE</Badge>
                             )}
                             {bounty.milestone_type === "photo_submission" && !isCompleted && !photoSubmissions[bounty.id] && (
                               <span className="text-xs text-primary font-medium flex items-center gap-1 shrink-0">
                                 <Camera className="w-3.5 h-3.5" /> Submit Photos →
                               </span>
                             )}
                             {isCompleted && <CheckCircle2 className="w-5 h-5 text-success shrink-0" />}
                           </CardTitle>
                          <p className="text-sm text-muted-foreground line-clamp-2">{bounty.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={isPaid ? "default" : isCompleted ? "outline" : "secondary"}
                            className={`${isPaid ? "bg-green-600" : ""} text-xs`}
                          >
                            {isPaid ? "Paid" : isCompleted ? "Qualified" : "Active"}
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                      <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                        <span className="text-sm font-medium">Reward</span>
                        <span className="text-lg font-bold text-primary">
                          {formatCurrency(Number(bounty.reward_amount))}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{getMilestoneLabel(bounty.milestone_type)}</span>
                          <span className="font-medium">
                            {bounty.milestone_type === "revenue"
                              ? formatCurrency(bounty.currentValue)
                              : bounty.currentValue.toLocaleString()}{" "}
                            / {bounty.milestone_type === "revenue"
                              ? formatCurrency(bounty.milestone_value)
                              : bounty.milestone_value.toLocaleString()}
                          </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                      {deadline && !isCompleted && (
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2 text-sm">
                            <Zap className="w-4 h-4 text-warning" />
                            <span className="text-muted-foreground">Time remaining</span>
                          </div>
                          <CountdownTimer endDate={deadline} />
                        </div>
                      )}
                      {deadline && isCompleted && (
                        <div className="flex items-center gap-2 text-sm text-success">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Completed in time!</span>
                        </div>
                      )}
                      {bounty.milestone_type === "referrals" && !isCompleted && (
                        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 leading-relaxed space-y-1">
                          <p>💬 Already talked to 2–3 people who are ready to jump on? <strong className="text-foreground">Message an admin in the app</strong> with their name and contact info.</p>
                          <p>We'll reach out to them privately, get them onboarded, and send their samples — you don't need to do anything else.</p>
                          <p className="text-[10px] opacity-70">iMessage and Instagram DMs don't count — in-app only.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Mobile bottom drawer: full bounty details ── */}
      <Drawer open={!!selectedBounty} onOpenChange={(open) => { if (!open) setSelectedBounty(null); }}>
        <DrawerContent className="max-h-[85vh]">
          {selectedBounty && (() => {
            const b = selectedBounty;
            const progress = getProgressPercentage(b);
            const isCompleted = b.creatorProgress?.qualified;
            const isPaid = b.creatorProgress?.payout_approved;
            const deadline = getDeadline(b);

            return (
              <div className="overflow-y-auto pb-8">
                <DrawerHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <DrawerTitle className="text-left text-base leading-snug flex-1">
                      {b.title}
                      {isCompleted && <CheckCircle2 className="inline w-4 h-4 text-success ml-2 -mt-0.5" />}
                    </DrawerTitle>
                    <Badge
                      variant={isPaid ? "default" : isCompleted ? "outline" : "secondary"}
                      className={`${isPaid ? "bg-green-600" : ""} text-[10px] shrink-0`}
                    >
                      {isPaid ? "Paid" : isCompleted ? "Qualified" : "Active"}
                    </Badge>
                  </div>
                  {b.description && (
                    <p className="text-sm text-muted-foreground text-left mt-1">{b.description}</p>
                  )}
                </DrawerHeader>

                <div className="px-4 space-y-4">
                  {/* Reward */}
                  <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                    <span className="text-sm font-medium">Reward</span>
                    <span className="text-lg font-bold text-primary">
                      {formatCurrency(Number(b.reward_amount))}
                    </span>
                  </div>

                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{getMilestoneLabel(b.milestone_type)}</span>
                      <span className="font-medium">
                        {b.milestone_type === "revenue"
                          ? formatCurrency(b.currentValue)
                          : b.currentValue.toLocaleString()}{" "}
                        / {b.milestone_type === "revenue"
                          ? formatCurrency(b.milestone_value)
                          : b.milestone_value.toLocaleString()}
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* Countdown */}
                  {deadline && !isCompleted && (
                    <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="w-4 h-4 text-warning" />
                        <span className="text-muted-foreground">Time remaining</span>
                      </div>
                      <CountdownTimer endDate={deadline} />
                    </div>
                  )}
                  {deadline && isCompleted && (
                    <div className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Completed in time!</span>
                    </div>
                  )}

                  {/* Profile complete checklist */}
                  {b.milestone_type === "profile_complete" && (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg text-sm">
                      <p className="font-medium text-foreground">Requirements:</p>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`w-4 h-4 ${creatorProfile?.avatar_url ? "text-success" : "text-muted-foreground/40"}`} />
                        <span className={creatorProfile?.avatar_url ? "" : "text-muted-foreground"}>Upload a profile photo</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`w-4 h-4 ${creatorProfile?.stripe_onboarding_complete ? "text-success" : "text-muted-foreground/40"}`} />
                        <span className={creatorProfile?.stripe_onboarding_complete ? "" : "text-muted-foreground"}>Connect your payout account</span>
                      </div>
                    </div>
                  )}

                  {/* Referral note */}
                  {b.milestone_type === "referrals" && !isCompleted && (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 leading-relaxed space-y-2">
                      <p>💬 Already talked to 2–3 people who are ready to jump on? <strong className="text-foreground">Message an admin in the app</strong> with their name and contact info.</p>
                      <p>We'll reach out to them privately, get them onboarded, and send their samples — you don't need to do anything else.</p>
                      <p className="text-xs opacity-70">iMessage and Instagram DMs don't count — in-app only.</p>
                    </div>
                  )}

                  {/* Photo submission form */}
                  {b.milestone_type === "photo_submission" && (() => {
                    const existingSub = photoSubmissions[b.id];
                    if (existingSub) {
                      return (
                        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Camera className="w-4 h-4 text-primary" />
                            <span>Submission {existingSub.status === "approved" ? "Approved ✅" : existingSub.status === "rejected" ? "Needs Revision" : "Pending Review"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <ExternalLink className="w-3 h-3" />
                            <a href={existingSub.link_url} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">{existingSub.link_url}</a>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {existingSub.edited_count} edited · {existingSub.raw_count} raw photos
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-4 p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm leading-relaxed space-y-2">
                          <p>📸 We need at least <strong className="text-foreground">5 fully edited</strong> high-quality UGC photos. If you've got all of them polished and ready, we'd love to appreciate you even more.</p>
                          <p>On top of that, send us <strong className="text-foreground">20–25 raw throwaway shots</strong> — the candid, in-the-moment stuff you captured while shooting.</p>
                          <p className="text-xs text-muted-foreground">Use WeTransfer, Google Drive, or any file sharing link.</p>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="photo-link" className="text-xs">File Transfer Link *</Label>
                            <Input
                              id="photo-link"
                              placeholder="https://we.tl/... or Google Drive link"
                              value={photoLink}
                              onChange={(e) => setPhotoLink(e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="edited-count" className="text-xs">Edited Photos</Label>
                              <Input
                                id="edited-count"
                                type="number"
                                min={1}
                                value={photoEditedCount}
                                onChange={(e) => setPhotoEditedCount(Number(e.target.value))}
                              />
                            </div>
                            <div>
                              <Label htmlFor="raw-count" className="text-xs">Raw/Throwaway Photos</Label>
                              <Input
                                id="raw-count"
                                type="number"
                                min={1}
                                value={photoRawCount}
                                onChange={(e) => setPhotoRawCount(Number(e.target.value))}
                              />
                            </div>
                          </div>

                          <div>
                            <Label htmlFor="photo-notes" className="text-xs">Notes (optional)</Label>
                            <Textarea
                              id="photo-notes"
                              placeholder="Any notes about the shoot..."
                              value={photoNotes}
                              onChange={(e) => setPhotoNotes(e.target.value)}
                              className="min-h-[60px]"
                            />
                          </div>

                          <Button
                            className="w-full"
                            onClick={() => handlePhotoSubmit(b.id)}
                            disabled={!photoLink.trim() || photoSubmitting}
                          >
                            {photoSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                            Submit Photos
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </CreatorLayout>
  );
}
