import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Video,
  DollarSign,
  Upload,
  Trophy,
  ArrowRight,
  CheckCircle,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: string;
  link: string;
  completed: boolean;
}

export function CreatorOnboarding() {
  const { profileId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);

  async function sendPrepEmail(userId: string) {
    try {
      await supabase.functions.invoke("send-notification-email", {
        body: {
          user_id: userId,
          title: "📚 Get Prepped Before Your Sample Arrives!",
          message: "Now that you're all set up, it's time to get familiar with everything so you can hit the ground running!\n\n1. Head to the Briefs section — Read through the creative brief so you know exactly what kind of content we're looking for.\n\n2. Check out the Learn tab — This is packed with tips on how to create videos that actually perform and earn you money.\n\n3. Visit the Resources tab — Everything you need from brand guidelines to examples is right there.\n\nThe creators who prep before their sample arrives are the ones who start earning fastest. You've got this! 💪",
          notification_type: "general",
          link: "/creator/briefs",
          button_text: "Start Prepping",
        },
      });
      console.log("Prep email sent to user:", userId);
    } catch (err) {
      console.error("Failed to send prep email:", err);
    }
  }

  useEffect(() => {
    if (profileId) {
      checkOnboardingStatus();
    }
  }, [profileId]);

  async function checkOnboardingStatus() {
    try {
      // Check profile completion
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, stripe_onboarding_complete, social_handles, instagram_user_id, partnership_ads_enabled")
        .eq("id", profileId)
        .single();

      // Check if user has submitted any videos
      const { count: videoCount } = await supabase
        .from("videos")
        .select("id", { count: "exact" })
        .eq("creator_id", profileId);

      const hasCompletedProfile = Boolean(profile?.full_name);
      const hasConnectedStripe = Boolean(profile?.stripe_onboarding_complete);
      const hasSubmittedVideo = (videoCount || 0) > 0;
      // Now checking for verified Instagram OAuth connection
      const hasInstagramConnected = Boolean(profile?.partnership_ads_enabled && profile?.instagram_user_id);

      const onboardingSteps: OnboardingStep[] = [
        {
          id: "profile",
          title: "Complete your profile",
          description: "Add your name and avatar to personalize your experience",
          icon: <CheckCircle className="w-5 h-5" />,
          action: "Complete Profile",
          link: "/creator/profile",
          completed: hasCompletedProfile,
        },
        {
          id: "stripe",
          title: "Connect payout account",
          description: "Link your bank account to receive earnings",
          icon: <DollarSign className="w-5 h-5" />,
          action: "Connect Bank",
          link: "/creator/profile",
          completed: hasConnectedStripe,
        },
        {
          id: "instagram",
          title: "Connect Instagram",
          description: "Link your Instagram for verified Partnership Ads",
          icon: <Sparkles className="w-5 h-5" />,
          action: "Connect Instagram",
          link: "/creator/profile",
          completed: hasInstagramConnected,
        },
        {
          id: "video",
          title: "Submit your first video",
          description: "Upload a video to start earning commissions",
          icon: <Upload className="w-5 h-5" />,
          action: "Submit Video",
          link: "/creator/submit",
          completed: hasSubmittedVideo,
        },
      ];

      setSteps(onboardingSteps);

      // Show onboarding if not all steps are completed and it's a new user
      const allCompleted = onboardingSteps.every((s) => s.completed);
      const hasSeenOnboarding = localStorage.getItem(`onboarding_seen_${user?.id}`);
      
      if (!allCompleted && !hasSeenOnboarding) {
        setOpen(true);
      }

      // Send prep email when all onboarding steps are completed
      const hasSentPrepEmail = localStorage.getItem(`prep_email_sent_${user?.id}`);
      if (allCompleted && !hasSentPrepEmail && user?.id) {
        localStorage.setItem(`prep_email_sent_${user?.id}`, "true");
        sendPrepEmail(user.id);
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(`onboarding_seen_${user?.id}`, "true");
    setOpen(false);
  }

  const completedCount = steps.filter((s) => s.completed).length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  if (loading || steps.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Welcome to CreatorHub!
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Getting started</span>
              <span className="font-medium">{completedCount}/{steps.length} complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {steps.map((step, index) => (
              <Card
                key={step.id}
                className={`transition-all ${
                  step.completed
                    ? "bg-success/5 border-success/20"
                    : "hover:border-primary/30"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        step.completed
                          ? "bg-success/10 text-success"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {step.completed ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        step.icon
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium text-sm ${
                          step.completed ? "text-success" : ""
                        }`}
                      >
                        {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                    {!step.completed && (
                      <Button size="sm" asChild onClick={() => setOpen(false)}>
                        <Link to={step.link}>
                          {step.action}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-2">
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              Skip for now
            </Button>
            {completedCount === steps.length && (
              <Button onClick={() => setOpen(false)}>
                <Sparkles className="w-4 h-4 mr-2" />
                Start Creating
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
