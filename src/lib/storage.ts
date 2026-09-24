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
 * Link that downloads the original file under `filename` instead of the storage object name
 * (`1790292037873-7jntuquhh.mov`). Storage sets Content-Disposition from `?download=`, so the
 * browser streams straight to disk, bytes untouched. A cross-origin `<a download>` can't rename.
 */
export function getVideoDownloadUrl(videoUrl: string | null, filename: string): string | null {
  const url = getVideoUrl(videoUrl);
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`;
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
