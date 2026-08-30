-- Add AI analysis fields to videos table
ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS hook_score integer CHECK (hook_score >= 0 AND hook_score <= 100),
ADD COLUMN IF NOT EXISTS hook_analysis text,
ADD COLUMN IF NOT EXISTS ai_creative_insights jsonb,
ADD COLUMN IF NOT EXISTS analyzed_at timestamp with time zone;

-- Create table for weekly performance digests
CREATE TABLE IF NOT EXISTS public.performance_digests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start date NOT NULL,
  week_end date NOT NULL,
  digest_data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(week_start)
);

-- Enable RLS
ALTER TABLE public.performance_digests ENABLE ROW LEVEL SECURITY;

-- Allow admins to read digests
CREATE POLICY "Admins can read performance digests"
ON public.performance_digests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Allow service role to insert/update digests (for edge functions)
CREATE POLICY "Service role can manage digests"
ON public.performance_digests
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_videos_hook_score ON public.videos(hook_score DESC) WHERE hook_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_analyzed_at ON public.videos(analyzed_at DESC) WHERE analyzed_at IS NOT NULL;