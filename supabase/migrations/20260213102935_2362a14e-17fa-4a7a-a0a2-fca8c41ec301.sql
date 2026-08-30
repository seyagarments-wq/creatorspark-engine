-- Add 'revision_requested' to video_status enum
ALTER TYPE public.video_status ADD VALUE IF NOT EXISTS 'revision_requested';