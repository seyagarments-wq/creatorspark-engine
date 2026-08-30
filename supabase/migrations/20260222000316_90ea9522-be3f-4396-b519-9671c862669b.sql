
-- Add audio_url column to messages
ALTER TABLE public.messages ADD COLUMN audio_url text;

-- Create storage bucket for voice notes
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-audio', 'chat-audio', true);

-- Storage policies for chat-audio bucket
CREATE POLICY "Authenticated users can upload audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-audio' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view chat audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-audio');

CREATE POLICY "Users can delete their own audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
