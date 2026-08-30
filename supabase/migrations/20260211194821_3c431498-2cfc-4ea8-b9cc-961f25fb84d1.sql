-- Add bounty_id column to videos table
ALTER TABLE public.videos
ADD COLUMN bounty_id uuid REFERENCES public.bounties(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_videos_bounty_id ON public.videos(bounty_id);