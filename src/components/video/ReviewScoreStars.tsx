import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewScoreStarsProps {
  value: number | null;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
  className?: string;
}

export function ReviewScoreStars({ value, onChange, size = "md", className }: ReviewScoreStarsProps) {
  const dim = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  const readOnly = !onChange;

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          aria-label={`${n} out of 5`}
          onClick={() => onChange?.(n)}
          className={cn(
            "rounded transition-transform",
            !readOnly && "hover:scale-110 cursor-pointer",
            readOnly && "cursor-default"
          )}
        >
          <Star
            className={cn(
              dim,
              (value ?? 0) >= n ? "fill-warning text-warning" : "text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </div>
  );
}
