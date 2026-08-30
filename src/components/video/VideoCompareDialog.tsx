import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVideoUrl } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { Search, X, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoSummary {
  id: string;
  title: string;
  unique_video_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string;
  creator_name: string;
}

interface VideoCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional pre-selected video IDs (from bulk select) */
  preselectedIds?: string[];
}

export function VideoCompareDialog({
  open,
  onOpenChange,
  preselectedIds,
}: VideoCompareDialogProps) {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [slotA, setSlotA] = useState<VideoSummary | null>(null);
  const [slotB, setSlotB] = useState<VideoSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchVideos();
    } else {
      // Reset state on close
      setSlotA(null);
      setSlotB(null);
      setSearchQuery("");
    }
  }, [open]);

  // Pre-select videos when preselectedIds are provided
  useEffect(() => {
    if (preselectedIds && preselectedIds.length >= 2 && videos.length > 0) {
      const a = videos.find((v) => v.id === preselectedIds[0]);
      const b = videos.find((v) => v.id === preselectedIds[1]);
      if (a) setSlotA(a);
      if (b) setSlotB(b);
    }
  }, [preselectedIds, videos]);

  async function fetchVideos() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("id, title, unique_video_id, video_url, thumbnail_url, status, profiles:creator_id(full_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setVideos(
        (data || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          unique_video_id: v.unique_video_id,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url,
          status: v.status,
          creator_name: v.profiles?.full_name || "Unknown",
        }))
      );
    } catch (err) {
      console.error("Failed to fetch videos for compare:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = searchQuery
    ? videos.filter(
        (v) =>
          v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.unique_video_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.creator_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : videos;

  function handlePickVideo(video: VideoSummary) {
    if (slotA?.id === video.id || slotB?.id === video.id) return;
    if (!slotA) {
      setSlotA(video);
    } else if (!slotB) {
      setSlotB(video);
    }
  }

  const isComparing = slotA && slotB;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Columns2 className="w-5 h-5" />
            Side-by-Side Compare
          </DialogTitle>
          <DialogDescription>
            Pick two videos to compare them side by side.
          </DialogDescription>
        </DialogHeader>

        {/* Comparison area */}
        <div className="p-4 space-y-4">
          {/* Slots */}
          <div className="grid grid-cols-2 gap-4">
            <CompareSlot
              label="Video A"
              video={slotA}
              onClear={() => setSlotA(null)}
            />
            <CompareSlot
              label="Video B"
              video={slotB}
              onClear={() => setSlotB(null)}
            />
          </div>

          {/* Picker - show when a slot is empty */}
          {!isComparing && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, ID, or creator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <ScrollArea className="h-48 border rounded-lg">
                <div className="p-2 space-y-1">
                  {loading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading videos…</p>
                  ) : filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No videos found</p>
                  ) : (
                    filtered.map((video) => {
                      const isSelected = slotA?.id === video.id || slotB?.id === video.id;
                      return (
                        <button
                          key={video.id}
                          disabled={isSelected}
                          onClick={() => handlePickVideo(video)}
                          className={cn(
                            "w-full flex items-center gap-3 p-2 rounded-md text-left text-sm transition-colors",
                            isSelected
                              ? "opacity-50 cursor-not-allowed bg-muted"
                              : "hover:bg-accent cursor-pointer"
                          )}
                        >
                          <div className="w-10 shrink-0">
                            <VideoThumbnail
                              thumbnailUrl={video.thumbnail_url}
                              videoUrl={video.video_url}
                              title={video.title}
                              size="sm"
                              showPlayButton={false}
                              showStatus={false}
                              className="w-10 !aspect-[9/16]"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{video.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {video.unique_video_id} · {video.creator_name}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {video.status}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compare Slot ───────────────────────────────────────────────────────────

function CompareSlot({
  label,
  video,
  onClear,
}: {
  label: string;
  video: VideoSummary | null;
  onClear: () => void;
}) {
  const fullUrl = video?.video_url ? getVideoUrl(video.video_url) : null;

  if (!video) {
    return (
      <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl flex flex-col items-center justify-center min-h-[280px] text-muted-foreground gap-2">
        <Columns2 className="w-8 h-8 opacity-40" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs">Pick a video below</span>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{video.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {video.unique_video_id} · {video.creator_name}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 w-7 h-7"
          onClick={onClear}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="bg-black">
        {fullUrl ? (
          <video
            key={video.id}
            src={fullUrl}
            controls
            playsInline
            className="w-full max-h-[50vh] object-contain"
          />
        ) : (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            No video file
          </div>
        )}
      </div>
    </div>
  );
}
