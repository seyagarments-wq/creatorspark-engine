-- =====================================================
-- GAMIFICATION SYSTEM: XP, Levels, Streaks & Challenges
-- =====================================================

-- Creator gamification progress table
CREATE TABLE public.creator_gamification (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- XP & Level System
  total_xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  
  -- Streak Tracking
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  streak_type TEXT NOT NULL DEFAULT 'upload', -- 'upload' or 'sale'
  
  -- Weekly Challenge Progress (reset weekly)
  weekly_challenge_id UUID,
  weekly_challenge_progress INTEGER NOT NULL DEFAULT 0,
  weekly_challenge_completed BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Weekly challenges definition table
CREATE TABLE public.weekly_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  challenge_type TEXT NOT NULL, -- 'upload_count', 'sale_count', 'revenue', 'impressions'
  target_value INTEGER NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  bonus_reward NUMERIC DEFAULT 0, -- Optional cash bonus
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Creator challenge completions (history)
CREATE TABLE public.creator_challenge_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.weekly_challenges(id) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  xp_earned INTEGER NOT NULL,
  bonus_earned NUMERIC DEFAULT 0,
  UNIQUE(creator_id, challenge_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.creator_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_challenge_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for creator_gamification
CREATE POLICY "Creators can view their own gamification" 
ON public.creator_gamification 
FOR SELECT 
USING (creator_id = get_my_profile_id());

CREATE POLICY "Creators can update their own gamification" 
ON public.creator_gamification 
FOR UPDATE 
USING (creator_id = get_my_profile_id());

CREATE POLICY "System can insert gamification records" 
ON public.creator_gamification 
FOR INSERT 
WITH CHECK (creator_id = get_my_profile_id());

CREATE POLICY "Admins can manage all gamification" 
ON public.creator_gamification 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for weekly_challenges
CREATE POLICY "Everyone can view active challenges" 
ON public.weekly_challenges 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage challenges" 
ON public.weekly_challenges 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for creator_challenge_completions
CREATE POLICY "Creators can view their completions" 
ON public.creator_challenge_completions 
FOR SELECT 
USING (creator_id = get_my_profile_id());

CREATE POLICY "Creators can insert their completions" 
ON public.creator_challenge_completions 
FOR INSERT 
WITH CHECK (creator_id = get_my_profile_id());

CREATE POLICY "Admins can manage all completions" 
ON public.creator_challenge_completions 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger to update timestamps
CREATE TRIGGER update_creator_gamification_updated_at
BEFORE UPDATE ON public.creator_gamification
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial weekly challenges (rotating examples)
INSERT INTO public.weekly_challenges (title, description, challenge_type, target_value, xp_reward, bonus_reward, week_start, week_end)
VALUES 
  ('Upload Champion', 'Upload 5 videos this week', 'upload_count', 5, 250, 25, 
   date_trunc('week', CURRENT_DATE)::date, 
   (date_trunc('week', CURRENT_DATE) + interval '6 days')::date),
  ('Sales Sprint', 'Generate 10 sales this week', 'sale_count', 10, 500, 50,
   date_trunc('week', CURRENT_DATE)::date, 
   (date_trunc('week', CURRENT_DATE) + interval '6 days')::date),
  ('Impression Blitz', 'Reach 100K impressions across your videos', 'impressions', 100000, 300, 0,
   date_trunc('week', CURRENT_DATE)::date, 
   (date_trunc('week', CURRENT_DATE) + interval '6 days')::date);

-- Create a function to calculate level from XP
CREATE OR REPLACE FUNCTION public.calculate_level(xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- Level formula: Each level requires progressively more XP
  -- Level 1: 0-99 XP
  -- Level 2: 100-299 XP  
  -- Level 3: 300-599 XP
  -- Level N: Uses formula floor(sqrt(xp/50)) + 1
  RETURN GREATEST(1, floor(sqrt(xp::float / 50)) + 1)::integer;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to get XP needed for next level
CREATE OR REPLACE FUNCTION public.xp_for_level(level INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- Inverse of calculate_level formula
  RETURN ((level - 1) * (level - 1) * 50)::integer;
END;
$$ LANGUAGE plpgsql IMMUTABLE;