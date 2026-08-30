import { Flame, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StreakIndicatorProps {
  currentStreak: number;
  longestStreak: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function StreakIndicator({
  currentStreak,
  longestStreak,
  size = "md",
  showLabel = true,
  className,
}: StreakIndicatorProps) {
  const isOnFire = currentStreak >= 7;
  const isBurning = currentStreak >= 3;

  const sizeClasses = {
    sm: "text-sm gap-1",
    md: "text-base gap-1.5",
    lg: "text-lg gap-2",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  if (currentStreak === 0) {
    return (
      <div className={cn("flex items-center text-muted-foreground", sizeClasses[size], className)}>
        <Flame className={cn(iconSizes[size], "opacity-30")} />
        {showLabel && <span>No streak</span>}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center font-semibold",
            sizeClasses[size],
            isOnFire
              ? "text-red-500"
              : isBurning
              ? "text-orange-500"
              : "text-amber-500",
            className
          )}
        >
          <div className="relative">
            <Flame
              className={cn(
                iconSizes[size],
                isOnFire && "animate-pulse"
              )}
            />
            {isOnFire && (
              <Flame
                className={cn(
                  iconSizes[size],
                  "absolute inset-0 animate-ping opacity-30"
                )}
              />
            )}
          </div>
          <span>{currentStreak}</span>
          {showLabel && <span className="text-muted-foreground font-normal ml-1">day streak</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="space-y-1">
          <p className="font-semibold">
            🔥 {currentStreak} day streak!
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Trophy className="w-3 h-3" />
            Best: {longestStreak} days
          </p>
          {currentStreak >= 7 && (
            <p className="text-xs text-amber-500">You're on fire! 🎉</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
