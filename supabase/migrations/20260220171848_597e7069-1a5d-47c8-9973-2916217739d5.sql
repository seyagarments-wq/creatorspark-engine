
-- Create application-videos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('application-videos', 'application-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone (including anonymous) to upload to this bucket
CREATE POLICY "Anyone can upload application videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'application-videos');

-- Allow public read access
CREATE POLICY "Public read access for application videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'application-videos');
