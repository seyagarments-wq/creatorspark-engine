-- Create storage bucket for brief assets (videos, PDFs, images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brief-assets', 'brief-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to brief-assets bucket
CREATE POLICY "Admins can upload brief assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'brief-assets' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow public read access to brief assets
CREATE POLICY "Brief assets are publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'brief-assets');

-- Allow admins to delete brief assets
CREATE POLICY "Admins can delete brief assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'brief-assets' 
  AND public.has_role(auth.uid(), 'admin')
);