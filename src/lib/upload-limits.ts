/**
 * Video upload limits, shared by the picker pre-flight and the upload path.
 * Keep MAX_VIDEO_BYTES in step with the `videos` bucket's file_size_limit
 * (supabase/migrations/20260916000100_videos_bucket_limits.sql) and the
 * project-wide storage limit (1 GB, set 2026-09-15).
 */
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GiB
export const MAX_VIDEO_LABEL = "1 GB";

/** MIME types the `videos` bucket accepts. Thumbnails share the bucket as image/jpeg. */
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
  "video/x-matroska",
] as const;

const EXT_TO_TYPE: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  mkv: "video/x-matroska",
};

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/**
 * Resolve the content type to send. Browsers sometimes hand over an empty
 * `file.type` (iOS Safari does this for some picker paths), so fall back to
 * the extension before giving up.
 */
export function resolveVideoType(file: File): string | null {
  const t = (file.type || "").toLowerCase();
  if ((ALLOWED_VIDEO_TYPES as readonly string[]).includes(t)) return t;
  const byExt = EXT_TO_TYPE[fileExtension(file.name)];
  return byExt ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export type VideoFileCheck =
  | { ok: true; contentType: string }
  | { ok: false; reason: string };

/** Pre-flight a picked file before it is ever queued for upload. */
export function checkVideoFile(file: File): VideoFileCheck {
  if (file.size === 0) {
    return { ok: false, reason: "The file is empty." };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      reason: `${formatBytes(file.size)} is over the ${MAX_VIDEO_LABEL} limit. Trim the clip or export at a lower resolution and try again.`,
    };
  }
  const contentType = resolveVideoType(file);
  if (!contentType) {
    return {
      ok: false,
      reason: `${file.type || fileExtension(file.name).toUpperCase() || "This file type"} is not a supported video format. Use MP4 or MOV.`,
    };
  }
  return { ok: true, contentType };
}
