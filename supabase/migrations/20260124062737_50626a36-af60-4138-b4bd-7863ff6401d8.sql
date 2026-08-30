-- Add meta_error_reason column for better error tracking
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS meta_error_reason text;

-- Add comment for clarity
COMMENT ON COLUMN public.videos.meta_error_reason IS 'Error message if Meta upload failed, allows retry';