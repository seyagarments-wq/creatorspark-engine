import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap, Sparkles, AlertTriangle } from "lucide-react";

interface HookScoreBadgeProps {
  score: number | null;
  analysis?: string | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function HookScoreBadge({ score, analysis, size = "md", showLabel = false }: HookScoreBadgeProps) {
  if (score === null || score === undefined) {
    return null;
  }

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-success bg-success/10 border-success/30";
    if (s >= 60) return "text-info bg-info/10 border-info/30";
    if (s >= 40) return "text-warning bg-warning/10 border-warning/30";
    return "text-destructive bg-destructive/10 border-destructive/30";
  };

  const getScoreIcon = (s: number) => {
    if (s >= 80) return <Sparkles className="w-3 h-3" />;
    if (s >= 60) return <Zap className="w-3 h-3" />;
    return <AlertTriangle className="w-3 h-3" />;
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return "Excellent Hook";
    if (s >= 60) return "Good Hook";
    if (s >= 40) return "Average Hook";
    return "Weak Hook";
  };

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 gap-1",
    md: "text-sm px-2 py-1 gap-1.5",
    lg: "text-base px-3 py-1.5 gap-2",
  };

  const badge = (
    <div
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        getScoreColor(score),
        sizeClasses[size]
      )}
    >
      {getScoreIcon(score)}
      <span>{score}</span>
      {showLabel && <span className="text-xs opacity-80">/ 100</span>}
    </div>
  );

  if (analysis) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="font-medium mb-1">{getScoreLabel(score)}</p>
            <p className="text-xs text-muted-foreground">{analysis}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}
