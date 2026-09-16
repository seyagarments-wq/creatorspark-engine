-- Explicit limits on the `videos` bucket instead of inheriting the project default.
-- Context: the first real creator upload (2026-09-15) died on the phone before reaching
-- storage, and the project-wide limit was 50 MB under a UI that promised 500 MB. The
-- project limit is now 1 GB (Management API); this pins the bucket to the same number so the
-- limit is visible in the repo and cannot drift with the dashboard setting.
--
-- Thumbnails are written into this same bucket as image/jpeg by CreatorSubmit, so JPEG stays.
-- Keep src/lib/upload-limits.ts (MAX_VIDEO_BYTES, ALLOWED_VIDEO_TYPES) in step with this.

UPDATE storage.buckets
SET
  file_size_limit = 1073741824, -- 1 GiB
  allowed_mime_types = ARRAY[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v',
    'video/3gpp',
    'video/x-matroska',
    'image/jpeg'
  ]
WHERE id = 'videos';
