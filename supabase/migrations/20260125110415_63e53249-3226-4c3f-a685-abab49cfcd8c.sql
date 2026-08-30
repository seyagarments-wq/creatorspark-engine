-- Add social_links column to brands table for storing social media handles
ALTER TABLE public.brands 
ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb;