import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UploadedFile {
  name: string;
  url: string;
  type: "video" | "document" | "image";
}

export function useBriefUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  async function uploadFile(file: File): Promise<UploadedFile | null> {
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `briefs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("brief-assets")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("brief-assets")
        .getPublicUrl(filePath);

      // Determine file type
      let type: "video" | "document" | "image" = "document";
      if (file.type.startsWith("video/")) {
        type = "video";
      } else if (file.type.startsWith("image/")) {
        type = "image";
      }

      const uploadedFile: UploadedFile = {
        name: file.name,
        url: urlData.publicUrl,
        type,
      };

      setUploadedFiles((prev) => [...prev, uploadedFile]);
      return uploadedFile;
    } catch (error) {
      console.error("Upload error:", error);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function uploadMultipleFiles(files: FileList): Promise<UploadedFile[]> {
    const results: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      const result = await uploadFile(file);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  function removeFile(url: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.url !== url));
  }

  function resetFiles() {
    setUploadedFiles([]);
  }

  function setInitialFiles(videoUrls: string[], moodBoardUrls: string[]) {
    const files: UploadedFile[] = [
      ...videoUrls.map((url) => ({
        name: url.split("/").pop() || "video",
        url,
        type: "video" as const,
      })),
      ...moodBoardUrls.map((url) => ({
        name: url.split("/").pop() || "file",
        url,
        type: url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? "image" as const : "document" as const,
      })),
    ];
    setUploadedFiles(files);
  }

  return {
    uploading,
    uploadedFiles,
    uploadFile,
    uploadMultipleFiles,
    removeFile,
    resetFiles,
    setInitialFiles,
  };
}
