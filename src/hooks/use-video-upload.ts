import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface UploadProgress {
  progress: number;
  status: "idle" | "uploading" | "success" | "error";
  error?: string;
}

export function useVideoUpload() {
  const { user } = useAuth();
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    progress: 0,
    status: "idle",
  });

  async function uploadVideo(file: File): Promise<string | null> {
    if (!user) {
      setUploadProgress({ progress: 0, status: "error", error: "Not authenticated" });
      return null;
    }

    setUploadProgress({ progress: 0, status: "uploading" });

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get the public URL for the video
      const { data: urlData } = supabase.storage
        .from("videos")
        .getPublicUrl(fileName);

      setUploadProgress({ progress: 100, status: "success" });
      return urlData.publicUrl;
    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadProgress({
        progress: 0,
        status: "error",
        error: error.message || "Upload failed",
      });
      return null;
    }
  }

  function resetUpload() {
    setUploadProgress({ progress: 0, status: "idle" });
  }

  return {
    uploadVideo,
    uploadProgress,
    resetUpload,
  };
}
