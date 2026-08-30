import { supabase } from "@/integrations/supabase/client";

/**
 * Converts a storage path to a full public URL.
 * Handles both relative paths (legacy) and full URLs (new uploads).
 */
export function getVideoUrl(videoUrl: string | null): string | null {
  if (!videoUrl) return null;
  
  // Already a full URL
  if (videoUrl.startsWith("http://") || videoUrl.startsWith("https://")) {
    return videoUrl;
  }
  
  // Convert relative path to public URL
  const { data } = supabase.storage.from("videos").getPublicUrl(videoUrl);
  return data.publicUrl;
}

/**
 * Converts an avatar path to a full public URL.
 */
export function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }
  
  const { data } = supabase.storage.from("avatars").getPublicUrl(avatarUrl);
  return data.publicUrl;
}
