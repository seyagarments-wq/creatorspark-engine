-- Allow admins to upload brand logos to avatars bucket (in brand-logos folder)
CREATE POLICY "Admins can upload brand logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND has_role(auth.uid(), 'admin'::app_role)
  AND (storage.foldername(name))[1] = 'brand-logos'
);

-- Allow admins to update brand logos
CREATE POLICY "Admins can update brand logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND has_role(auth.uid(), 'admin'::app_role)
  AND (storage.foldername(name))[1] = 'brand-logos'
);

-- Allow admins to delete brand logos
CREATE POLICY "Admins can delete brand logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND has_role(auth.uid(), 'admin'::app_role)
  AND (storage.foldername(name))[1] = 'brand-logos'
);