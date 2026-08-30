import { useState, useCallback } from "react";
import { useCreatorProgress } from "@/hooks/use-creator-progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { playSoundEffect } from "@/hooks/use-sound-effects";
import { 
  Target, 
  Clock, 
  CheckCircle2, 
  Trophy,
  Upload,
  ShoppingCart,
  Eye,
  DollarSign,
  Sparkles,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WeeklyChallengesCardProps {
  className?: string;
}

const challengeIcons: Record<string, React.ReactNode> = {
  upload_count: <Upload className="w-4 h-4" />,
  sale_count: <ShoppingCart className="w-4 h-4" />,
  impressions: <Eye className="w-4 h-4" />,
  revenue: <DollarSign className="w-4 h-4" />,
};

export function WeeklyChallengesCard({ className }: WeeklyChallengesCardProps) {
  const { challenges, completeChallenge } = useCreatorProgress();
  const [flashingId, setFlashingId] = useState<string | null>(null);

  const handleClaimChallenge = useCallback(async (id: string, xp: number, bonus: number) => {
    // Flash the row green + play sound
    setFlashingId(id);
    try { playSoundEffect("success"); } catch {/* ignore */}
    await completeChallenge(id, xp, bonus);
    setTimeout(() => setFlashingId(null), 1200);
  }, [completeChallenge]);

  const getDaysRemaining = (weekEnd: string) => {
    const end = new Date(weekEnd);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  const completedCount = challenges.filter(c => c.isCompleted).length;

  if (challenges.length === 0) {
    return null;
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3 md:p-6 pb-2 md:pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Target className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
            Weekly Challenges
          </CardTitle>
          <Badge variant="outline" className="bg-amber-500/10 border-amber-500/20 text-amber-600 text-xs">
            {completedCount}/{challenges.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-4 space-y-2 md:space-y-4">
        {challenges.map((challenge) => {
          const progressPercent = Math.min(
            (challenge.currentProgress / challenge.targetValue) * 100,
            100
          );
          const isComplete = challenge.currentProgress >= challenge.targetValue;
          const daysRemaining = getDaysRemaining(challenge.weekEnd);

          return (
            <div
              key={challenge.id}
              className={cn(
                "relative p-2.5 md:p-4 rounded-lg md:rounded-xl border transition-all duration-500",
                flashingId === challenge.id
                  ? "bg-success/20 border-success/60 ring-2 ring-success/30"
                  : challenge.isCompleted
                  ? "bg-success/5 border-success/30"
                  : isComplete
                  ? "bg-primary/5 border-primary/30 ring-2 ring-primary/20"
                  : "bg-muted/30 border-border"
              )}
            >
              {/* Completion badge */}
              {challenge.isCompleted && (
                <div className="absolute top-2 right-2 md:top-3 md:right-3">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-success" />
                </div>
              )}

              <div className="flex items-start gap-2 md:gap-3">
                {/* Icon */}
                <div className={cn(
                  "p-1.5 md:p-2.5 rounded-lg",
                  challenge.isCompleted 
                    ? "bg-success/10 text-success" 
                    : isComplete
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {challengeIcons[challenge.challengeType] || <Trophy className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={cn(
                      "font-semibold text-sm md:text-base",
                      challenge.isCompleted && "text-muted-foreground"
                    )}>
                      {challenge.title}
                    </h4>
                    {challenge.isExclusive && (
                      <Badge className="gap-1 bg-purple-500/15 text-purple-600 border-purple-500/30 text-[10px] px-1.5 py-0">
                        <Lock className="w-2.5 h-2.5" />
                        EXCLUSIVE
                      </Badge>
                    )}
                  </div>
                  {/* Hide description on mobile */}
                  {challenge.description && (
                    <p className="hidden md:block text-sm text-muted-foreground mb-3">
                      {challenge.description}
                    </p>
                  )}

                  {/* Progress Bar */}
                  <div className="space-y-1 md:space-y-1.5 mt-1 md:mt-0">
                    <div className="flex items-center justify-between text-xs md:text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">
                        {challenge.currentProgress.toLocaleString()} / {challenge.targetValue.toLocaleString()}
                      </span>
                    </div>
                    <Progress 
                      value={progressPercent} 
                      className={cn(
                        "h-1.5 md:h-2",
                        challenge.isCompleted && "opacity-50"
                      )}
                    />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-2 md:mt-3">
                    <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                      <Badge variant="secondary" className="gap-1 text-xs px-1.5 md:px-2 py-0.5">
                        <Sparkles className="w-3 h-3" />
                        +{challenge.xpReward}
                      </Badge>
                      {challenge.bonusReward > 0 && (
                        <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs px-1.5 md:px-2 py-0.5">
                          <DollarSign className="w-3 h-3" />
                          +${challenge.bonusReward}
                        </Badge>
                      )}
                    </div>
                    
                    {!challenge.isCompleted && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {daysRemaining}d
                      </div>
                    )}
                  </div>

                  {/* Claim Button */}
                  {isComplete && !challenge.isCompleted && (
                    <Button
                      size="sm"
                      className="mt-2 md:mt-3 w-full gap-2 h-8 md:h-9 text-xs md:text-sm"
                      onClick={() => handleClaimChallenge(challenge.id, challenge.xpReward, challenge.bonusReward)}
                    >
                      <Trophy className="w-3 h-3 md:w-4 md:h-4" />
                      Claim
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
