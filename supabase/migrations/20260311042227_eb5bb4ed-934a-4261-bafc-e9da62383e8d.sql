
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Backfill existing approved videos
UPDATE public.videos SET approved_at = updated_at WHERE status = 'approved' AND approved_at IS NULL;
