-- Make chat-images bucket public so images can be displayed
UPDATE storage.buckets SET public = true WHERE id = 'chat-images';

-- Create RLS policies for chat-images bucket
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload chat images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'chat-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow anyone to view chat images (since bucket is public)
CREATE POLICY "Chat images are publicly viewable" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'chat-images');

-- Allow users to delete their own chat images
CREATE POLICY "Users can delete own chat images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'chat-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);