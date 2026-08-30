-- Add Meta integration columns to videos table
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS meta_video_id text,
ADD COLUMN IF NOT EXISTS meta_creative_id text,
ADD COLUMN IF NOT EXISTS meta_status text DEFAULT 'not_uploaded',
ADD COLUMN IF NOT EXISTS meta_uploaded_at timestamp with time zone;

-- Add index for faster Meta status queries
CREATE INDEX IF NOT EXISTS idx_videos_meta_status ON public.videos(meta_status);

-- Add comment for clarity
COMMENT ON COLUMN public.videos.meta_video_id IS 'Video ID returned by Meta Ads API after upload';
COMMENT ON COLUMN public.videos.meta_creative_id IS 'Creative ID for the ad in Meta';
COMMENT ON COLUMN public.videos.meta_status IS 'Status of Meta sync: not_uploaded, uploading, uploaded, live, error';
COMMENT ON COLUMN public.videos.meta_uploaded_at IS 'Timestamp when video was uploaded to Meta';