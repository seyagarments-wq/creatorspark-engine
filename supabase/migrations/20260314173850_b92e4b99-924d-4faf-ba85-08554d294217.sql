
-- Sticker packs table
CREATE TABLE public.sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active sticker packs"
  ON public.sticker_packs FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Admins can manage sticker packs"
  ON public.sticker_packs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Individual stickers table
CREATE TABLE public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view stickers"
  ON public.stickers FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage stickers"
  ON public.stickers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Stickers storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('stickers', 'stickers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for stickers bucket
CREATE POLICY "Anyone can view stickers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'stickers');

CREATE POLICY "Admins can upload stickers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'stickers' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete stickers"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'stickers' AND has_role(auth.uid(), 'admin'::app_role));
