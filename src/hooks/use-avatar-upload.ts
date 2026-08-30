import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function useAvatarUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  async function uploadAvatar(file: File): Promise<string | null> {
    if (!user) return null;

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      // Delete existing avatar if any
      await supabase.storage
        .from("avatars")
        .remove([fileName]);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error: any) {
      console.error("Avatar upload error:", error);
      return null;
    } finally {
      setUploading(false);
    }
  }

  return {
    uploadAvatar,
    uploading,
  };
}
