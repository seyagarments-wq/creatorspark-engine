
CREATE TABLE public.creative_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  image_url TEXT,
  tags TEXT[],
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view creative references"
  ON public.creative_references FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert creative references"
  ON public.creative_references FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update creative references"
  ON public.creative_references FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete creative references"
  ON public.creative_references FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));
