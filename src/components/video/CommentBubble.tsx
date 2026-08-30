import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommentBubbleProps {
  videoId: string;
  onClick: () => void;
  className?: string;
}

export function CommentBubble({ videoId, onClick, className }: CommentBubbleProps) {
  const [count, setCount] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const hasFetchedRef = useRef(false);

  async function fetchCountOnce() {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const { count: c } = await supabase
      .from("video_comments")
      .select("id", { count: "exact", head: true })
      .eq("video_id", videoId);

    setCount(c || 0);
  }

  useEffect(() => {
    hasFetchedRef.current = false;
    setCount(null);

    const element = buttonRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchCountOnce();
          observer.disconnect();
        }
      },
      { rootMargin: "120px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [videoId]);

  return (
    <button
      ref={buttonRef}
      onClick={(e) => {
        e.stopPropagation();
        fetchCountOnce();
        onClick();
      }}
      className={cn(
        "relative flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-400 hover:bg-amber-400/30 transition-colors text-xs font-medium",
        className
      )}
    >
      <MessageCircle className="w-3.5 h-3.5" />
      {count !== null && count > 0 && <span>{count}</span>}
    </button>
  );
}
