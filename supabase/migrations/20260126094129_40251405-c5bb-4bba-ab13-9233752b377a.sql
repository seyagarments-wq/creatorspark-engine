-- Create table for manual Meta ad to video/creator mappings
CREATE TABLE public.meta_ad_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_ad_id TEXT NOT NULL,
  meta_ad_name TEXT,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(meta_ad_id)
);

-- Enable RLS
ALTER TABLE public.meta_ad_mappings ENABLE ROW LEVEL SECURITY;

-- Admins can manage all mappings
CREATE POLICY "Admins can manage ad mappings"
ON public.meta_ad_mappings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Creators can view their own mappings
CREATE POLICY "Creators can view their mappings"
ON public.meta_ad_mappings
FOR SELECT
USING (creator_id = public.get_my_profile_id());

-- Add updated_at trigger
CREATE TRIGGER update_meta_ad_mappings_updated_at
BEFORE UPDATE ON public.meta_ad_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();