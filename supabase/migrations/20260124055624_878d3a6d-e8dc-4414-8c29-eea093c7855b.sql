-- Create storage buckets for videos, avatars, and chat images
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', false);

-- Videos bucket policies (creators upload their own, admins can access all)
CREATE POLICY "Creators can upload their own videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'videos' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Creators can view their own videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'videos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can access all videos"
ON storage.objects FOR ALL
USING (
  bucket_id = 'videos' 
  AND has_role(auth.uid(), 'admin')
);

-- Avatars bucket policies (public read, users manage their own)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Chat images bucket policies (members can upload, view if in chat)
CREATE POLICY "Authenticated users can upload chat images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-images' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can view chat images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-images' 
  AND auth.uid() IS NOT NULL
);

-- Add stripe_account_id to profiles for Stripe Connect
ALTER TABLE public.profiles ADD COLUMN stripe_account_id text;

-- Create settings table for app-wide configuration
CREATE TABLE public.settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage settings"
ON public.settings FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Anyone authenticated can read settings (for things like tier thresholds)
CREATE POLICY "Authenticated users can read settings"
ON public.settings FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create trigger for settings updated_at
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES 
  ('commission', '{"default": 10, "bronze": 5, "silver": 8, "gold": 12, "platinum": 15}'::jsonb),
  ('payout_threshold', '{"minimum": 50}'::jsonb),
  ('video_review', '{"auto_approve": false, "require_review": true}'::jsonb),
  ('notifications', '{"email_enabled": true}'::jsonb);