
-- Allow any authenticated user to create sticker packs
CREATE POLICY "Authenticated users can create sticker packs"
  ON public.sticker_packs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow any authenticated user to insert stickers
CREATE POLICY "Authenticated users can insert stickers"
  ON public.stickers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow any authenticated user to upload to stickers bucket
CREATE POLICY "Authenticated users can upload stickers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'stickers' AND auth.uid() IS NOT NULL);

-- Add reply_to_id column for reply-to-message feature
ALTER TABLE public.messages ADD COLUMN reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
