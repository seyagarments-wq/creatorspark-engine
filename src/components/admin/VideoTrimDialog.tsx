import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getVideoUrl } from "@/lib/storage";
import {
  Scissors,
  Play,
  Pause,
  Loader2,
  AlertTriangle,
  SkipBack,
  SkipForward,
  SplitSquareHorizontal,
  VolumeX,
  Volume2,
  Music,
  Upload,
  X,
} from "lucide-react";

interface VideoTrimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  videoUrl: string | null;
  videoTitle: string;
  onTrimComplete: () => void;
}

interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  removed: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

let clipIdCounter = 0;
function nextClipId() {
  return `clip_${++clipIdCounter}`;
}

export function VideoTrimDialog({
  open,
  onOpenChange,
  videoId,
  videoUrl,
  videoTitle,
  onTrimComplete,
}: VideoTrimDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [replacementAudio, setReplacementAudio] = useState<File | null>(null);
  const [replacementAudioName, setReplacementAudioName] = useState("");
  const { toast } = useToast();

  const resolvedUrl = getVideoUrl(videoUrl);

  const keptClips = clips.filter((c) => !c.removed);
  const removedClips = clips.filter((c) => c.removed);

  const totalOutputDuration = keptClips.reduce(
    (sum, c) => sum + (c.endTime - c.startTime),
    0
  );

  const hasChanges = removedClips.length > 0 || muteOriginal || replacementAudio !== null;

  // Reset on close
  useEffect(() => {
    if (!open) {
      setVideoLoaded(false);
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setProgress(0);
      setProgressLabel("");
      setClips([]);
      setIsDraggingPlayhead(false);
      setMuteOriginal(false);
      setReplacementAudio(null);
      setReplacementAudioName("");
    }
  }, [open]);

  // Mute/unmute video element to reflect toggle
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = muteOriginal;
    }
  }, [muteOriginal]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setVideoLoaded(true);
    setClips([
      { id: nextClipId(), startTime: 0, endTime: video.duration, removed: false },
    ]);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isDraggingPlayhead) return;
    setCurrentTime(video.currentTime);
  }, [isDraggingPlayhead]);

  function handlePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      video.play();
      setPlaying(true);
    }
  }

  function seekTo(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, duration));
    setCurrentTime(video.currentTime);
  }

  function skipFrames(direction: number) {
    seekTo(currentTime + direction * (1 / 30));
  }

  function splitAtPlayhead() {
    if (duration === 0) return;
    const t = currentTime;

    setClips((prev) => {
      const idx = prev.findIndex(
        (c) => t > c.startTime + 0.05 && t < c.endTime - 0.05
      );
      if (idx === -1) return prev;

      const clip = prev[idx];
      const left: Clip = {
        id: nextClipId(),
        startTime: clip.startTime,
        endTime: t,
        removed: clip.removed,
      };
      const right: Clip = {
        id: nextClipId(),
        startTime: t,
        endTime: clip.endTime,
        removed: clip.removed,
      };

      const next = [...prev];
      next.splice(idx, 1, left, right);
      return next;
    });
  }

  function toggleClipRemoved(clipId: string) {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, removed: !c.removed } : c))
    );
  }

  function deleteClip(clipId: string) {
    setClips((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== clipId);
    });
  }

  function handleTimelineMouseDown(e: React.MouseEvent) {
    setIsDraggingPlayhead(true);
    scrubTimeline(e);
  }

  function handleTimelineMouseMove(e: React.MouseEvent) {
    if (!isDraggingPlayhead) return;
    scrubTimeline(e);
  }

  function handleTimelineMouseUp() {
    setIsDraggingPlayhead(false);
  }

  function scrubTimeline(e: React.MouseEvent) {
    const timeline = timelineRef.current;
    if (!timeline || duration === 0) return;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    seekTo(pct * duration);
  }

  // Audio file handler
  function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["audio/mpeg", "audio/wav", "audio/mp3", "audio/x-wav", "audio/aac", "audio/ogg"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|aac|ogg|m4a)$/i)) {
      toast({
        title: "Invalid file type",
        description: "Please upload an MP3, WAV, AAC, or OGG file.",
        variant: "destructive",
      });
      return;
    }

    setReplacementAudio(file);
    setReplacementAudioName(file.name);
    setMuteOriginal(true); // Auto-mute original when replacement is added
  }

  function removeReplacementAudio() {
    setReplacementAudio(null);
    setReplacementAudioName("");
    if (audioInputRef.current) audioInputRef.current.value = "";
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || !videoLoaded) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === "s" || e.key === "S") {
        splitAtPlayhead();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipFrames(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipFrames(1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, videoLoaded, playing, currentTime, duration, clips]);

  // Preview: play only the kept clips in sequence
  function playPreview() {
    const video = videoRef.current;
    if (!video || keptClips.length === 0) return;

    let clipIdx = 0;
    video.currentTime = keptClips[0].startTime;
    setPlaying(true);
    video.play();

    const onUpdate = () => {
      const clip = keptClips[clipIdx];
      if (!clip) {
        video.pause();
        setPlaying(false);
        video.removeEventListener("timeupdate", onUpdate);
        return;
      }
      if (video.currentTime >= clip.endTime - 0.05) {
        clipIdx++;
        if (clipIdx < keptClips.length) {
          video.currentTime = keptClips[clipIdx].startTime;
        } else {
          video.pause();
          setPlaying(false);
          video.removeEventListener("timeupdate", onUpdate);
        }
      }
    };
    video.addEventListener("timeupdate", onUpdate);
  }

  async function handleSave() {
    if (!resolvedUrl || keptClips.length === 0) return;

    setSaving(true);
    setProgress(0);
    setProgressLabel("Preparing video capture...");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error("Video element not ready");

      // Set canvas to match video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;

      // Create a stream from the canvas
      const canvasStream = canvas.captureStream(30); // 30 fps

      // Handle audio: either replacement, original, or muted
      let audioContext: AudioContext | null = null;
      let audioDestination: MediaStreamAudioDestinationNode | null = null;

      if (replacementAudio && !muteOriginal) {
        // Use replacement audio
        try {
          audioContext = new AudioContext();
          audioDestination = audioContext.createMediaStreamDestination();
          const arrayBuffer = await replacementAudio.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioDestination);
          source.start();
          audioDestination.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
        } catch (audioErr) {
          console.warn("Could not load replacement audio:", audioErr);
        }
      } else if (!muteOriginal) {
        // Capture original audio from video element
        try {
          audioContext = new AudioContext();
          audioDestination = audioContext.createMediaStreamDestination();
          const source = audioContext.createMediaElementSource(video);
          source.connect(audioDestination);
          source.connect(audioContext.destination); // Also play through speakers
          audioDestination.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
        } catch (audioErr) {
          console.warn("Could not capture audio:", audioErr);
        }
      }

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";

      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 20_000_000, // 20 Mbps for maximum quality
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      // Record each kept clip in sequence
      setProgressLabel("Recording clips...");
      setProgress(10);

      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          resolve(blob);
        };
        recorder.onerror = (e) => reject(e);
      });

      recorder.start(100); // Collect data every 100ms

      // Play each kept clip and draw frames to canvas
      for (let i = 0; i < keptClips.length; i++) {
        const clip = keptClips[i];
        const clipDuration = clip.endTime - clip.startTime;
        setProgressLabel(`Recording clip ${i + 1}/${keptClips.length}...`);
        setProgress(10 + Math.round((i / keptClips.length) * 70));

        video.currentTime = clip.startTime;
        await new Promise<void>((r) => { video.onseeked = () => r(); });

        video.muted = muteOriginal;
        await video.play();

        // Draw frames until we reach the clip end
        await new Promise<void>((resolve) => {
          const drawFrame = () => {
            if (video.currentTime >= clip.endTime - 0.05 || video.paused) {
              video.pause();
              resolve();
              return;
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            requestAnimationFrame(drawFrame);
          };
          drawFrame();

          // Safety timeout
          setTimeout(() => {
            video.pause();
            resolve();
          }, (clipDuration + 1) * 1000);
        });
      }

      recorder.stop();
      setProgressLabel("Finalizing video...");
      setProgress(85);

      const blob = await recordingPromise;

      // Clean up audio context
      if (audioContext) {
        try { audioContext.close(); } catch (_) {}
      }

      setProgressLabel("Uploading...");
      setProgress(90);

      const filePath = `trimmed/${videoId}_edited_${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(filePath, blob, { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("videos")
        .getPublicUrl(filePath);

      // Generate thumbnail
      setProgressLabel("Generating thumbnail...");
      setProgress(95);

      let thumbUrl = urlData.publicUrl;
      const firstClip = keptClips[0];
      video.currentTime = firstClip.startTime;
      await new Promise<void>((r) => { video.onseeked = () => r(); });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnailBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8);
      });
      const thumbPath = `thumbnails/${videoId}_edited_${Date.now()}.jpg`;
      await supabase.storage
        .from("videos")
        .upload(thumbPath, thumbnailBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      const { data: thumbUrlData } = supabase.storage
        .from("videos")
        .getPublicUrl(thumbPath);
      thumbUrl = thumbUrlData.publicUrl;

      // Update DB
      const { error: updateError } = await supabase
        .from("videos")
        .update({
          video_url: urlData.publicUrl,
          thumbnail_url: thumbUrl,
          admin_edited: true,
          commission_override: 5,
        } as any)
        .eq("id", videoId);
      if (updateError) throw updateError;

      // Notify the creator
      const { data: editedVideoInfo } = (await supabase
        .from("videos")
        .select("creator_id, title, profiles!videos_creator_id_fkey(user_id)")
        .eq("id", videoId)
        .single()) as { data: any };

      if (editedVideoInfo?.profiles?.user_id) {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            user_id: editedVideoInfo.profiles.user_id,
            title: "Your video was edited",
            message: `Your video "${editedVideoInfo.title}" has been edited by the team. The updated version is now live with a 5% commission rate.`,
            notification_type: "video",
            link: "/creator/my-videos",
          },
        });
      }

      setProgress(100);
      setProgressLabel("Done!");

      toast({
        title: "Video saved",
        description: `${keptClips.length} clip${keptClips.length > 1 ? "s" : ""} merged${replacementAudio ? " with new audio" : muteOriginal ? " (muted)" : ""}. Commission set to 5%.`,
      });

      onTrimComplete();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Edit error:", error);
      toast({
        title: "Edit failed",
        description: error.message || "Failed to process video. Check browser console for details.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0">
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="w-5 h-5" />
              Video Editor
            </DialogTitle>
            <DialogDescription>{videoTitle}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6">
          {/* Commission Warning */}
          <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">
                Commission will drop to 5%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Editing a creator's video reduces the commission rate for this
                specific video only.
              </p>
            </div>
          </div>
        </div>

        {/* Video Player */}
        <div className="px-6 mt-4">
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {resolvedUrl ? (
              <video
                ref={videoRef}
                src={resolvedUrl}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setPlaying(false)}
                className="w-full h-full"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No video file available
              </div>
            )}
          </div>
        </div>

        {videoLoaded && (
          <div className="bg-muted/30 border-t border-border mt-4">
            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-2 py-3 px-6">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => skipFrames(-5)}
                className="h-8 w-8"
                title="Back 5 frames"
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="default"
                onClick={handlePlayPause}
                className="h-10 w-10 rounded-full"
              >
                {playing ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => skipFrames(5)}
                className="h-8 w-8"
                title="Forward 5 frames"
              >
                <SkipForward className="w-4 h-4" />
              </Button>

              <div className="mx-3 h-5 w-px bg-border" />

              <Button
                size="sm"
                variant="outline"
                onClick={splitAtPlayhead}
                className="gap-1.5 text-xs"
                title="Split at playhead (S)"
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                Split
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={playPreview}
                className="gap-1.5 text-xs"
                title="Preview kept clips only"
              >
                <Play className="w-3 h-3" />
                Preview Result
              </Button>

              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm font-mono text-foreground tabular-nums">
                  {formatTime(currentTime)}
                </span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-sm font-mono text-muted-foreground tabular-nums">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* ===== AUDIO CONTROLS ===== */}
            <div className="px-6 pb-3">
              <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-background">
                <Music className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audio</span>

                <div className="h-4 w-px bg-border" />

                {/* Mute toggle */}
                <div className="flex items-center gap-2">
                  <Switch
                    id="mute-toggle"
                    checked={muteOriginal}
                    onCheckedChange={(checked) => {
                      setMuteOriginal(checked);
                      if (!checked && replacementAudio) {
                        // If un-muting but replacement audio exists, keep muted
                        setMuteOriginal(true);
                        toast({
                          title: "Remove replacement audio first",
                          description: "Original audio stays muted while replacement audio is attached.",
                        });
                      }
                    }}
                  />
                  <Label htmlFor="mute-toggle" className="text-xs flex items-center gap-1.5 cursor-pointer">
                    {muteOriginal ? (
                      <VolumeX className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-primary" />
                    )}
                    {muteOriginal ? "Original muted" : "Original audio"}
                  </Label>
                </div>

                <div className="h-4 w-px bg-border" />

                {/* Replacement audio upload */}
                <input
                  ref={audioInputRef}
                  type="file"
                  accept=".mp3,.wav,.aac,.ogg,.m4a,audio/*"
                  className="hidden"
                  onChange={handleAudioUpload}
                />

                {replacementAudio ? (
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                    <Music className="w-3 h-3 text-primary" />
                    <span className="text-xs font-medium text-primary max-w-[140px] truncate">
                      {replacementAudioName}
                    </span>
                    <button
                      onClick={removeReplacementAudio}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove replacement audio"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => audioInputRef.current?.click()}
                    className="gap-1.5 text-xs h-7"
                  >
                    <Upload className="w-3 h-3" />
                    Replace Audio
                  </Button>
                )}
              </div>
            </div>

            {/* ===== TIMELINE ===== */}
            <div className="px-6 pb-4">
              {/* Time markers */}
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1 px-0.5">
                {Array.from({ length: 11 }).map((_, i) => (
                  <span key={i} className="tabular-nums">
                    {formatTime((duration * i) / 10)}
                  </span>
                ))}
              </div>

              {/* Timeline track with playhead */}
              <div
                ref={timelineRef}
                className="relative h-16 rounded-lg overflow-hidden cursor-crosshair select-none"
                onMouseDown={handleTimelineMouseDown}
                onMouseMove={handleTimelineMouseMove}
                onMouseUp={handleTimelineMouseUp}
                onMouseLeave={handleTimelineMouseUp}
              >
                {/* Clip segments */}
                <div className="absolute inset-0 flex">
                  {clips.map((clip) => {
                    const widthPct =
                      ((clip.endTime - clip.startTime) / duration) * 100;
                    return (
                      <div
                        key={clip.id}
                        className={`h-full border-r border-background/50 transition-colors relative group ${
                          clip.removed
                            ? "bg-destructive/20"
                            : "bg-primary/40"
                        }`}
                        style={{ width: `${widthPct}%` }}
                      >
                        {/* Clip label */}
                        <div
                          className={`absolute inset-x-0 top-0 px-1.5 py-0.5 text-[9px] font-medium truncate ${
                            clip.removed
                              ? "text-destructive"
                              : "text-primary-foreground/80"
                          }`}
                        >
                          {clip.removed ? "CUT" : "KEEP"}
                        </div>

                        {/* Diagonal lines for removed sections */}
                        {clip.removed && (
                          <div
                            className="absolute inset-0 opacity-30"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(45deg, transparent, transparent 4px, hsl(var(--destructive)) 4px, hsl(var(--destructive)) 5px)",
                            }}
                          />
                        )}

                        {/* Hover action */}
                        <button
                          className={`absolute inset-x-0 bottom-0 h-6 flex items-center justify-center gap-1 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity ${
                            clip.removed
                              ? "bg-primary/80 text-primary-foreground"
                              : "bg-destructive/80 text-destructive-foreground"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleClipRemoved(clip.id);
                          }}
                        >
                          {clip.removed ? "↩ Keep" : "✕ Remove"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground z-20 pointer-events-none"
                  style={{ left: `${playheadPct}%` }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-foreground rotate-45 rounded-sm" />
                </div>
              </div>

              {/* Clip summary strip */}
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                {clips.map((clip) => (
                  <div
                    key={clip.id}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all ${
                      clip.removed
                        ? "border-destructive/30 bg-destructive/5 text-destructive line-through"
                        : "border-primary/30 bg-primary/5 text-primary"
                    }`}
                  >
                    <span>
                      {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                    </span>
                    <span className="text-muted-foreground ml-0.5">
                      ({formatTime(clip.endTime - clip.startTime)})
                    </span>
                    <button
                      onClick={() => toggleClipRemoved(clip.id)}
                      className="ml-1 hover:opacity-70"
                      title={clip.removed ? "Keep this clip" : "Remove this clip"}
                    >
                      {clip.removed ? "↩" : "✕"}
                    </button>
                  </div>
                ))}
              </div>

              {/* Output info */}
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>
                    <strong className="text-foreground">{keptClips.length}</strong>{" "}
                    kept
                  </span>
                  {removedClips.length > 0 && (
                    <span>
                      <strong className="text-destructive">
                        {removedClips.length}
                      </strong>{" "}
                      removed
                    </span>
                  )}
                  {(muteOriginal || replacementAudio) && (
                    <span className="flex items-center gap-1">
                      {replacementAudio ? (
                        <>
                          <Music className="w-3 h-3 text-primary" />
                          <strong className="text-primary">Custom audio</strong>
                        </>
                      ) : (
                        <>
                          <VolumeX className="w-3 h-3 text-destructive" />
                          <strong className="text-destructive">Muted</strong>
                        </>
                      )}
                    </span>
                  )}
                </div>
                <Badge variant="outline" className="text-xs">
                  Output: {formatTime(totalOutputDuration)}
                </Badge>
              </div>

              {/* Keyboard hints */}
              <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">
                    Space
                  </kbd>{" "}
                  Play/Pause
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">
                    S
                  </kbd>{" "}
                  Split
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">
                    ← →
                  </kbd>{" "}
                  Frame step
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {saving && (
          <div className="space-y-2 px-6 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{progressLabel}</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <DialogFooter className="p-6 pt-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !videoLoaded || !hasChanges}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Scissors className="w-4 h-4 mr-2" />
                Save Edit ({keptClips.length} clip
                {keptClips.length !== 1 && "s"} — 5% commission)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
