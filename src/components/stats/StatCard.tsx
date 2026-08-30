import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export default function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "text-accent",
}: StatCardProps) {
  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-lg">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("p-2.5 rounded-xl bg-accent/10 backdrop-blur-sm", iconColor.replace("text-", "bg-").replace("accent", "accent/10"))}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        {change && (
          <span
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-full",
              changeType === "positive" && "bg-success/10 text-success",
              changeType === "negative" && "bg-destructive/10 text-destructive",
              changeType === "neutral" && "bg-muted text-muted-foreground"
            )}
          >
            {change}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{title}</p>
      </div>
    </div>
  );
}
