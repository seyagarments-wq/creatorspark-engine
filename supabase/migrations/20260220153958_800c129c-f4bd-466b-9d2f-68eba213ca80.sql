
-- Referrals table
CREATE TABLE public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_email text NOT NULL,
  referee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  bonus_amount numeric NOT NULL DEFAULT 25,
  bonus_paid boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their own referrals"
  ON public.referrals FOR SELECT
  USING (referrer_id = get_my_profile_id());

CREATE POLICY "Creators can insert referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (referrer_id = get_my_profile_id());

CREATE POLICY "Admins can manage all referrals"
  ON public.referrals FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Leaderboard reactions table
CREATE TABLE public.leaderboard_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reactor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL DEFAULT '🔥',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (reactor_id, target_creator_id)
);

ALTER TABLE public.leaderboard_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view reactions"
  ON public.leaderboard_reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Creators can insert their own reactions"
  ON public.leaderboard_reactions FOR INSERT
  WITH CHECK (reactor_id = get_my_profile_id());

CREATE POLICY "Creators can delete their own reactions"
  ON public.leaderboard_reactions FOR DELETE
  USING (reactor_id = get_my_profile_id());

CREATE POLICY "Admins can manage all reactions"
  ON public.leaderboard_reactions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for referrals updated_at
CREATE OR REPLACE FUNCTION public.update_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_referrals_updated_at();
