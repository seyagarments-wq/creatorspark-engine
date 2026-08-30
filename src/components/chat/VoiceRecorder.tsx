import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VoiceRecorderProps {
  userId: string;
  onRecorded: (audioUrl: string) => void;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
}

export function VoiceRecorder({ userId, onRecorded, disabled, className, size = "default" }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) {
          toast.error("Recording too short");
          setRecording(false);
          return;
        }

        setUploading(true);
        try {
          const path = `${userId}/${Date.now()}.webm`;
          const { error } = await supabase.storage
            .from("chat-audio")
            .upload(path, blob, { contentType: "audio/webm" });
          if (error) throw error;
          const { data } = supabase.storage.from("chat-audio").getPublicUrl(path);
          onRecorded(data.publicUrl);
        } catch {
          toast.error("Failed to upload voice note");
        } finally {
          setUploading(false);
          setRecording(false);
          setDuration(0);
        }
      };

      mediaRecorder.start(250);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  }, [userId, onRecorded]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (uploading) {
    return (
      <Button type="button" variant="ghost" size="icon" disabled className={className}>
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-destructive font-mono animate-pulse">
          ● {formatDuration(duration)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={stopRecording}
          className={`text-destructive ${className}`}
        >
          <Square className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={startRecording}
      disabled={disabled}
      className={className}
      title="Record voice note"
    >
      <Mic className={size === "sm" ? "w-4 h-4" : "w-5 h-5"} />
    </Button>
  );
}
