import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UploadResult {
  imageUrl?: string;
  videoUrl?: string;
}

export function useChatMediaUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadMedia = async (file: File, userId: string): Promise<UploadResult | null> => {
    if (!file || !userId) return null;

    // Validate file type
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      toast.error("Only images and videos are allowed");
      return null;
    }

    // Validate file size (max 50MB for videos, 10MB for images)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large. Max ${isVideo ? "50MB" : "10MB"}`);
      return null;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "file";
      const timestamp = Date.now();
      const filePath = `${userId}/${timestamp}.${fileExt}`;

      // Upload to appropriate bucket
      const bucket = isVideo ? "videos" : "chat-images";
      
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      if (isVideo) {
        return { videoUrl: urlData.publicUrl };
      } else {
        return { imageUrl: urlData.publicUrl };
      }
    } catch (error) {
      console.error("Error uploading media:", error);
      toast.error("Failed to upload media");
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { uploadMedia, uploading };
}
