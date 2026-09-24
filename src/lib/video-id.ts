import { supabase } from "@/integrations/supabase/client";

import { findVideoIds } from "../../supabase/functions/_shared/video-id";

export { findVideoIds, resolveVideoIdFromName, videoDownloadName } from "../../supabase/functions/_shared/video-id";

/**
 * Extract the first V-tracking ID from a string (e.g., ad name).
 * Returns null if no match found. Matching rules live in supabase/functions/_shared/video-id.ts.
 */
export function extractVideoId(text: string): string | null {
  return findVideoIds(text)[0] ?? null;
}

/**
 * Extract ALL V-tracking IDs from a string.
 */
export function extractAllVideoIds(text: string): string[] {
  return findVideoIds(text);
}

/**
 * Generates a unique video ID in the V[MONTH][DAY]-[SEQUENCE] format.
 * Uses UTC timezone for consistency across all users.
 * 
 * Examples: V227-1, V219-2, V1231-5
 * 
 * The month+day prefix makes IDs globally unique so the same day-number
 * in different months never produces the same ID (e.g., Feb 19 = V219,
 * Mar 19 = V319).
 * 
 * The sequence counter:
 * - Resets daily at midnight UTC
 * - Is global across all creators (not per-creator)
 * - Is atomic to prevent race conditions
 * 
 * @returns Promise<string> The generated video ID (e.g., "V219-3")
 */
export async function generateUniqueVideoId(): Promise<string> {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Use UTC date for consistency across timezones
      const now = new Date();
      const month = now.getUTCMonth() + 1; // 1-12
      const dayOfMonth = now.getUTCDate();
      const targetDate = now.toISOString().split('T')[0]; // YYYY-MM-DD in UTC

      // Call database function to get next sequence atomically
      const { data, error } = await supabase.rpc('get_next_video_sequence', {
        target_date: targetDate
      });

      if (error) {
        console.error(`Video ID generation attempt ${attempt + 1} failed:`, error);
        lastError = new Error(error.message);
        continue;
      }

      const sequence = data;
      return `V${month}${dayOfMonth}-${sequence}`;
    } catch (err: any) {
      console.error(`Video ID generation attempt ${attempt + 1} exception:`, err);
      lastError = err;
    }
  }

  // All retries failed
  console.error('All video ID generation attempts failed:', lastError);
  throw new Error('Failed to generate video ID after multiple attempts. Please try again.');
}

/**
 * Validates that a video ID doesn't already exist in the database.
 * 
 * @param videoId The video ID to check
 * @returns Promise<boolean> True if the ID is unique, false if it exists
 */
export async function validateUniqueVideoId(videoId: string): Promise<{ isUnique: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('id')
      .eq('unique_video_id', videoId)
      .maybeSingle();

    if (error) {
      return { isUnique: false, error: error.message };
    }

    if (data) {
      return { isUnique: false, error: `Video ID "${videoId}" already exists` };
    }

    return { isUnique: true };
  } catch (err: any) {
    return { isUnique: false, error: err.message };
  }
}

/**
 * Checks if a video ID is in the new V[MONTH][DAY]-[SEQ] format
 */
export function isNewVideoIdFormat(videoId: string): boolean {
  return /^V\d+-\d+$/.test(videoId);
}

/**
 * Checks if a video ID is in the legacy format (creator_name_vid_timestamp_suffix)
 */
export function isLegacyVideoIdFormat(videoId: string): boolean {
  return !isNewVideoIdFormat(videoId);
}
