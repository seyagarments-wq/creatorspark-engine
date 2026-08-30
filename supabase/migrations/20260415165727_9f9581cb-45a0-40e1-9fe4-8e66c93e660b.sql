
-- Add new columns for direct photo uploads and Meta export
ALTER TABLE public.photo_submissions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS meta_status TEXT DEFAULT 'not_uploaded',
  ADD COLUMN IF NOT EXISTS meta_error_reason TEXT,
  ADD COLUMN IF NOT EXISTS meta_creative_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meta_uploaded_at TIMESTAMP WITH TIME ZONE;

-- Make bounty_id nullable for standalone photo submissions
ALTER TABLE public.photo_submissions
  ALTER COLUMN bounty_id DROP NOT NULL;

-- Make link_url nullable (not needed for direct uploads)
ALTER TABLE public.photo_submissions
  ALTER COLUMN link_url DROP NOT NULL;

-- Create photos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for photos bucket
CREATE POLICY "Photos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can delete photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photos' AND has_role(auth.uid(), 'admin'::app_role));
