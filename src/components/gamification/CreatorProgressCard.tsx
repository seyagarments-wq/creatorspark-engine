import { useEffect, useRef, useState } from "react";
import { useCreatorProgress, getLevelTitle } from "@/hooks/use-creator-progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MilestoneCelebration } from "@/components/MilestoneCelebration";
import { Flame, Zap, Trophy, Star, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreatorProgressCardProps {
  compact?: boolean;
  className?: string;
}

export function CreatorProgressCard({ compact = false, className }: CreatorProgressCardProps) {
  const { progress, challenges } = useCreatorProgress();
  const [showLevelUp, setShowLevelUp] = useState(false);
  const prevLevelRef = useRef<number | null>(null);

  // Detect level-up via localStorage comparison
  useEffect(() => {
    if (progress.loading) return;
    const stored = localStorage.getItem("creator_level");
    const storedLevel = stored ? parseInt(stored, 10) : null;

    if (storedLevel !== null && progress.currentLevel > storedLevel) {
      setShowLevelUp(true);
    }
    localStorage.setItem("creator_level", String(progress.currentLevel));
    prevLevelRef.current = progress.currentLevel;
  }, [progress.currentLevel, progress.loading]);

  if (progress.loading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardContent className="p-6">
          <div className="h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const levelTitle = getLevelTitle(progress.currentLevel);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        {/* Level Badge */}
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg">
            {progress.currentLevel}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-500 rounded-full p-1">
            <Star className="w-3 h-3 text-white" />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{levelTitle}</span>
            <span className="text-xs text-muted-foreground">
              {progress.totalXp.toLocaleString()} XP
            </span>
          </div>
          <Progress value={progress.xpProgress} className="h-2" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              Level {progress.currentLevel}
            </span>
            <span className="text-xs text-muted-foreground">
              {(progress.xpForNextLevel - progress.totalXp).toLocaleString()} XP to next
            </span>
          </div>
        </div>

        {/* Streak */}
        {progress.currentStreak > 0 && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/10 rounded-full">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="font-semibold text-orange-600">{progress.currentStreak}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <MilestoneCelebration
        show={showLevelUp}
        title="Level Up! 🎉"
        subtitle={`You're now ${levelTitle} — Level ${progress.currentLevel}`}
        onComplete={() => setShowLevelUp(false)}
      />

      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent pb-2 p-3 md:p-6 md:pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm md:text-lg flex items-center gap-1.5 md:gap-2">
              <Zap className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              Your Progress
            </CardTitle>
            {progress.currentStreak > 0 && (
              <Badge variant="outline" className="bg-orange-500/10 border-orange-500/20 text-orange-600 text-[10px] md:text-xs px-1.5 py-0.5 md:px-2 md:py-1">
                <Flame className="w-2.5 h-2.5 md:w-3 md:h-3 mr-0.5 md:mr-1" />
                {progress.currentStreak}d streak
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-2 md:pt-4">
          <div className="flex items-center gap-3 md:gap-6">
            {/* Level Circle - smaller on mobile */}
            <div className="relative shrink-0">
              <div className="w-12 h-12 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-xl md:text-3xl shadow-xl ring-2 md:ring-4 ring-primary/20">
                {progress.currentLevel}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 md:-bottom-1 md:-right-1 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full p-0.5 md:p-1.5 shadow-lg">
                <Star className="w-2.5 h-2.5 md:w-4 md:h-4 text-white" />
              </div>
            </div>

            {/* Progress Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                <h3 className="font-bold text-sm md:text-lg">{levelTitle}</h3>
                <Sparkles className="w-3 h-3 md:w-4 md:h-4 text-primary" />
              </div>
              
              <div className="space-y-1.5 md:space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] md:text-sm text-muted-foreground">
                      {progress.totalXp.toLocaleString()} XP
                    </span>
                    <span className="text-[10px] md:text-sm font-medium">
                      Level {progress.currentLevel + 1}
                    </span>
                  </div>
                  <Progress value={progress.xpProgress} className="h-1.5 md:h-3" />
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                    {(progress.xpForNextLevel - progress.totalXp).toLocaleString()} XP to next
                  </p>
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-2 md:gap-4 pt-0.5 md:pt-2">
                  <div className="flex items-center gap-1">
                    <Flame className={cn(
                      "w-3 h-3 md:w-4 md:h-4",
                      progress.currentStreak > 0 ? "text-orange-500" : "text-muted-foreground"
                    )} />
                    <span className="text-[10px] md:text-sm">
                      <strong>{progress.currentStreak}</strong> streak
                    </span>
                  </div>
                  <div className="text-muted-foreground hidden md:block">•</div>
                  <div className="hidden md:flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span className="text-sm">
                      <strong>{progress.longestStreak}</strong> best streak
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Active Challenges Preview - Hidden on mobile */}
          {challenges.length > 0 && (
            <div className="hidden md:block mt-6 pt-4 border-t">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                Weekly Challenges
              </h4>
              <div className="space-y-2">
                {challenges.slice(0, 2).map((challenge) => (
                  <div 
                    key={challenge.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      challenge.isCompleted 
                        ? "bg-success/10 border border-success/20" 
                        : "bg-muted/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-medium truncate",
                        challenge.isCompleted && "line-through text-muted-foreground"
                      )}>
                        {challenge.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {challenge.currentProgress.toLocaleString()} / {challenge.targetValue.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={challenge.isCompleted ? "default" : "secondary"} className="ml-2">
                      +{challenge.xpReward} XP
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
