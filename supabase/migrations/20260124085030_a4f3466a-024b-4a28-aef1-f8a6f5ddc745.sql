-- Add video_url column to messages table for video attachments
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS video_url text;

-- Create storage policies for chat-images bucket
-- First, ensure the bucket exists and is properly configured
UPDATE storage.buckets SET public = false WHERE id = 'chat-images';

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view chat images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat images" ON storage.objects;

-- Policy: Authenticated users can upload to chat-images bucket
CREATE POLICY "Authenticated users can upload chat images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-images');

-- Policy: Authenticated users can view chat images
CREATE POLICY "Users can view chat images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-images');

-- Policy: Users can delete their own uploaded images
CREATE POLICY "Users can delete their own chat images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);