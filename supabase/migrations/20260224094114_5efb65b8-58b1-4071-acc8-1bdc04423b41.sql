
-- Create resources table for educational hub
CREATE TABLE public.resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  content_type TEXT NOT NULL DEFAULT 'link',
  content_url TEXT,
  content_body TEXT,
  thumbnail_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage resources"
ON public.resources
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Creators can view published resources"
ON public.resources
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_published = true);

-- Create trigger for updated_at
CREATE TRIGGER update_resources_updated_at
BEFORE UPDATE ON public.resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for resource files
INSERT INTO storage.buckets (id, name, public) VALUES ('resources', 'resources', true);

CREATE POLICY "Admins can upload resources"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'resources' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update resources files"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'resources' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete resources files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'resources' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view resources files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'resources');
