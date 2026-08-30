import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Trophy,
  Flame,
  Star,
  Zap,
  Crown,
  Target,
  TrendingUp,
  Video,
  DollarSign,
  Sparkles,
} from "lucide-react";

export type AchievementType =
  | "first_video"
  | "five_videos"
  | "twenty_videos"
  | "fifty_videos"
  | "hundred_videos"
  | "first_sale"
  | "hundred_sales"
  | "thousand_sales"
  | "high_roas"
  | "top_earner"
  | "streak_7"
  | "streak_30"
  | "rising_star"
  | "viral_hit";

interface Achievement {
  id: AchievementType;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const achievements: Record<AchievementType, Achievement> = {
  first_video: {
    id: "first_video",
    name: "First Steps",
    description: "Submitted your first video",
    icon: <Video className="w-4 h-4" />,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  five_videos: {
    id: "five_videos",
    name: "Getting Started",
    description: "5 videos approved",
    icon: <Star className="w-4 h-4" />,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  twenty_videos: {
    id: "twenty_videos",
    name: "Consistent Creator",
    description: "20 videos approved",
    icon: <Zap className="w-4 h-4" />,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  fifty_videos: {
    id: "fifty_videos",
    name: "Prolific Producer",
    description: "50 videos approved",
    icon: <Trophy className="w-4 h-4" />,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  hundred_videos: {
    id: "hundred_videos",
    name: "Video Machine",
    description: "100 videos approved",
    icon: <Crown className="w-4 h-4" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  first_sale: {
    id: "first_sale",
    name: "Money Maker",
    description: "First sale generated",
    icon: <DollarSign className="w-4 h-4" />,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  hundred_sales: {
    id: "hundred_sales",
    name: "Sales Pro",
    description: "100 sales generated",
    icon: <Target className="w-4 h-4" />,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  thousand_sales: {
    id: "thousand_sales",
    name: "Sales Legend",
    description: "1,000 sales generated",
    icon: <Sparkles className="w-4 h-4" />,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  high_roas: {
    id: "high_roas",
    name: "ROI Master",
    description: "Achieved 5x+ ROAS",
    icon: <TrendingUp className="w-4 h-4" />,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
  },
  top_earner: {
    id: "top_earner",
    name: "Top Earner",
    description: "Reached $1,000+ earnings",
    icon: <Crown className="w-4 h-4" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  streak_7: {
    id: "streak_7",
    name: "Weekly Warrior",
    description: "7-day submission streak",
    icon: <Flame className="w-4 h-4" />,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  streak_30: {
    id: "streak_30",
    name: "Monthly Master",
    description: "30-day submission streak",
    icon: <Flame className="w-4 h-4" />,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
  rising_star: {
    id: "rising_star",
    name: "Rising Star",
    description: "Top 10 on leaderboard",
    icon: <Star className="w-4 h-4" />,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  viral_hit: {
    id: "viral_hit",
    name: "Viral Hit",
    description: "1M+ impressions on a video",
    icon: <Zap className="w-4 h-4" />,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
};

interface AchievementBadgeProps {
  type: AchievementType;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  earned?: boolean;
}

export function AchievementBadge({
  type,
  size = "md",
  showTooltip = true,
  earned = true,
}: AchievementBadgeProps) {
  const achievement = achievements[type];
  if (!achievement) return null;

  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-6 h-6",
  };

  const badge = (
    <div
      className={cn(
        "rounded-full flex items-center justify-center transition-all",
        sizeClasses[size],
        earned ? achievement.bgColor : "bg-muted",
        earned ? achievement.color : "text-muted-foreground",
        !earned && "opacity-40 grayscale"
      )}
    >
      <div className={iconSizes[size]}>{achievement.icon}</div>
    </div>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <p className="font-semibold">{achievement.name}</p>
        <p className="text-xs text-muted-foreground">{achievement.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function getEarnedAchievements(stats: {
  approvedVideos: number;
  totalSales: number;
  roas: number;
  totalEarnings: number;
  rank?: number;
  maxImpressions?: number;
}): AchievementType[] {
  const earned: AchievementType[] = [];

  if (stats.approvedVideos >= 1) earned.push("first_video");
  if (stats.approvedVideos >= 5) earned.push("five_videos");
  if (stats.approvedVideos >= 20) earned.push("twenty_videos");
  if (stats.approvedVideos >= 50) earned.push("fifty_videos");
  if (stats.approvedVideos >= 100) earned.push("hundred_videos");

  if (stats.totalSales >= 1) earned.push("first_sale");
  if (stats.totalSales >= 100) earned.push("hundred_sales");
  if (stats.totalSales >= 1000) earned.push("thousand_sales");

  if (stats.roas >= 5) earned.push("high_roas");
  if (stats.totalEarnings >= 1000) earned.push("top_earner");

  if (stats.rank && stats.rank <= 10) earned.push("rising_star");
  if (stats.maxImpressions && stats.maxImpressions >= 1000000) earned.push("viral_hit");

  return earned;
}

export { achievements };
