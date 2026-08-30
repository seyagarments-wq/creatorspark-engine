import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyableVideoIdProps {
  videoId: string;
  className?: string;
  variant?: "badge" | "inline" | "prominent";
}

export function CopyableVideoId({ videoId, className, variant = "inline" }: CopyableVideoIdProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(videoId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }

  // Check if it's a new V##-# format
  const isNewFormat = /^V\d+-\d+$/.test(videoId);

  if (variant === "badge") {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "cursor-pointer hover:bg-muted transition-colors font-mono text-xs gap-1.5",
          isNewFormat ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/50",
          className
        )}
        onClick={handleCopy}
      >
        {videoId}
        {copied ? (
          <Check className="w-3 h-3 text-success" />
        ) : (
          <Copy className="w-3 h-3 opacity-50" />
        )}
      </Badge>
    );
  }

  if (variant === "prominent") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className={cn(
          "font-mono text-lg font-semibold",
          isNewFormat ? "text-primary" : "text-muted-foreground"
        )}>
          {videoId}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="w-4 h-4 text-success" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      </div>
    );
  }

  // Default inline variant
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors group",
        className
      )}
    >
      <span className={isNewFormat ? "text-primary font-medium" : ""}>
        {videoId}
      </span>
      {copied ? (
        <Check className="w-3 h-3 text-success" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      )}
    </button>
  );
}

// Helper to check if video ID is legacy format
export function isLegacyVideoId(videoId: string): boolean {
  return !/^V\d+-\d+$/.test(videoId);
}
