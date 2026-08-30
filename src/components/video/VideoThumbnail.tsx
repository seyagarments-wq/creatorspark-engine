import { useState, useRef, useEffect, useCallback } from "react";
import { Video, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getVideoUrl } from "@/lib/storage";

interface VideoThumbnailProps {
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  title?: string;
  status?: string;
  adminEdited?: boolean;
  showPlayButton?: boolean;
  showStatus?: boolean;
  onClick?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const statusStyles: Record<string, string> = {
  approved: "bg-success text-success-foreground",
  rejected: "bg-destructive text-destructive-foreground",
  pending: "bg-warning text-warning-foreground",
  revision_requested: "bg-amber-500 text-white",
};

// Global queue to limit concurrent frame extractions (prevents mobile OOM)
let activeExtractions = 0;
const MAX_CONCURRENT = 2;
const extractionQueue: Array<() => void> = [];

function enqueueExtraction(fn: () => void) {
  if (activeExtractions < MAX_CONCURRENT) {
    activeExtractions++;
    fn();
  } else {
    extractionQueue.push(fn);
  }
}

function dequeueExtraction() {
  activeExtractions--;
  if (extractionQueue.length > 0) {
    activeExtractions++;
    const next = extractionQueue.shift()!;
    next();
  }
}

/** Returns average brightness 0-255 of a 20×20 center sample */
function getFrameBrightness(canvas: HTMLCanvasElement): number {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return 255;
    const sampleSize = 20;
    const sx = Math.max(0, Math.floor((canvas.width - sampleSize) / 2));
    const sy = Math.max(0, Math.floor((canvas.height - sampleSize) / 2));
    const imageData = ctx.getImageData(sx, sy, sampleSize, sampleSize);
    const data = imageData.data;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return total / (data.length / 4);
  } catch {
    return 255;
  }
}

const DARK_THRESHOLD = 30; // frames darker than this are considered black

/** Check if an img element's rendered pixels are mostly black */
function isImageDark(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(img.naturalWidth || 64, 64);
    canvas.height = Math.min(img.naturalHeight || 64, 64);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const brightness = getFrameBrightness(canvas);
    return brightness < DARK_THRESHOLD;
  } catch {
    // CORS tainted canvas — can't read pixels; assume dark so we try extraction
    return true;
  }
}

export function VideoThumbnail({
  thumbnailUrl,
  videoUrl,
  title,
  status,
  adminEdited,
  showPlayButton = true,
  showStatus = true,
  onClick,
  className,
  size = "md",
}: VideoThumbnailProps) {
  const [posterFrame, setPosterFrame] = useState<string | null>(null);
  const [storedThumbIsDark, setStoredThumbIsDark] = useState(false);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const fullVideoUrl = videoUrl ? getVideoUrl(videoUrl) : null;

  // Observe visibility
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Extract poster frame when:
  // - visible AND has a video url AND (no stored thumb OR stored thumb is dark OR image errored)
  useEffect(() => {
    const needsExtraction =
      isVisible &&
      fullVideoUrl &&
      (!thumbnailUrl || storedThumbIsDark || imageError) &&
      !posterFrame;

    if (!needsExtraction) return;

    let cancelled = false;
    let video: HTMLVideoElement | null = null;
    let timeout: ReturnType<typeof setTimeout>;

    // Try multiple seek positions to find a bright frame
    const seekFractions = [0.25, 0.5, 0.75, 0.1, 0.9];
    let seekAttempt = 0;

    function trySeek() {
      if (cancelled || !video) return;
      const fraction = seekFractions[seekAttempt] ?? 0.25;
      const seekTo = Math.min(fraction * video.duration, video.duration - 0.1);
      video.currentTime = Math.max(0, seekTo);
    }

    enqueueExtraction(() => {
      if (cancelled) { dequeueExtraction(); return; }

      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";

      const cleanup = () => {
        if (video) {
          video.src = "";
          video.load();
          video = null;
        }
        clearTimeout(timeout);
        dequeueExtraction();
      };

      video.onloadedmetadata = () => {
        if (cancelled || !video) { cleanup(); return; }
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          trySeek();
        } else {
          cleanup();
        }
      };

      video.onseeked = () => {
        if (cancelled || !video) { cleanup(); return; }

        let shouldCleanup = true;
        try {
          const canvas = document.createElement("canvas");
          // Use native resolution up to 720x1280 for sharp display on all screens
          canvas.width = Math.min(video.videoWidth, 720);
          canvas.height = Math.min(video.videoHeight, 1280);
          const ctx = canvas.getContext("2d");

          if (ctx && video.videoWidth > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const brightness = getFrameBrightness(canvas);

            if (brightness < DARK_THRESHOLD && seekAttempt < seekFractions.length - 1) {
              // Frame too dark — try next seek position
              seekAttempt++;
              shouldCleanup = false;
              trySeek();
              return;
            }

            const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
            if (dataUrl && dataUrl !== "data:,") {
              setPosterFrame(dataUrl);
            }
          }
        } catch {
          // CORS or draw error — silently fail
        }

        if (shouldCleanup) cleanup();
      };

      video.onerror = () => cleanup();

      timeout = setTimeout(() => cleanup(), 8000);

      video.src = fullVideoUrl!;
      video.load();
    });

    return () => {
      cancelled = true;
    };
  }, [isVisible, thumbnailUrl, fullVideoUrl, posterFrame, storedThumbIsDark, imageError]);

  /** Called when the stored thumbnail image loads — check if it's actually dark */
  const handleStoredThumbLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // Cross-origin check: try canvas inspection. If tainted, assume dark and extract frame.
    if (isImageDark(e.currentTarget)) {
      setStoredThumbIsDark(true);
    }
  }, []);

  // What to display:
  // 1. If we have an extracted frame (better/brighter), always prefer it over a dark stored thumb
  // 2. If stored thumb is good (not dark, no error), show it
  // 3. Fallback icon if nothing available
  const showStoredThumb = thumbnailUrl && !storedThumbIsDark && !imageError;
  const showExtractedFrame = posterFrame && (storedThumbIsDark || !thumbnailUrl || imageError);
  const showFallback = !showStoredThumb && !showExtractedFrame && !posterFrame;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted group",
        size === "sm" && "w-full aspect-[9/16]",
        size === "md" && "w-full aspect-[9/16]",
        size === "lg" && "w-full aspect-[9/16]",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Stored thumbnail — hidden canvas read to detect darkness */}
      {thumbnailUrl && !imageError && (
        <img
          src={thumbnailUrl}
          alt={title || "Video thumbnail"}
          className={cn(
            "absolute inset-0 w-full h-full object-cover",
            storedThumbIsDark && "opacity-0 pointer-events-none" // hide dark ones
          )}
          loading="lazy"
          onLoad={handleStoredThumbLoad}
          onError={() => setImageError(true)}
          crossOrigin="anonymous"
        />
      )}

      {/* Extracted frame — shown when stored thumb is dark or missing */}
      {posterFrame && (
        <img
          src={posterFrame}
          alt={title || "Video thumbnail"}
          className={cn(
            "absolute inset-0 w-full h-full object-cover",
            !showExtractedFrame && "opacity-0 pointer-events-none"
          )}
          loading="lazy"
        />
      )}

      {/* Fallback icon when no usable thumbnail */}
      {showFallback && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <Video className="w-8 h-8 text-muted-foreground" />
        </div>
      )}

      {/* Play button — always visible with hover enhancement */}
      {showPlayButton && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/30 transition-all duration-150">
          <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-150">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}

      {/* Status badge */}
      {showStatus && status && (
        <Badge
          className={cn(
            "absolute top-2 left-2 text-xs",
            statusStyles[status] || "bg-secondary text-secondary-foreground"
          )}
        >
          {status === "revision_requested" ? "Revision" : status}
        </Badge>
      )}

      {/* Admin edited / enhanced badge */}
      {adminEdited && (
        <Badge className="absolute bottom-2 left-2 text-[10px] bg-violet-600 text-white gap-1 px-1.5 py-0.5">
          <Sparkles className="w-2.5 h-2.5" />
          Enhanced
        </Badge>
      )}
    </div>
  );
}

export default VideoThumbnail;
