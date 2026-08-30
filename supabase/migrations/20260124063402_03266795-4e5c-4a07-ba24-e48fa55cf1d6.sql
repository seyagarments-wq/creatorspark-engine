-- Add page_id and default_link columns to meta_credentials for Partnership Ads
ALTER TABLE public.meta_credentials
ADD COLUMN IF NOT EXISTS page_id text,
ADD COLUMN IF NOT EXISTS default_link text;