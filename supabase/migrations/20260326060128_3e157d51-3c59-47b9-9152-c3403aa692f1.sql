
-- Add redeemable_xp column to creator_gamification
ALTER TABLE public.creator_gamification ADD COLUMN redeemable_xp integer NOT NULL DEFAULT 0;

-- Consistency tracking table
CREATE TABLE public.creator_consistency_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tracking_date date NOT NULL,
  upload_count integer NOT NULL DEFAULT 0,
  is_consistent boolean NOT NULL DEFAULT false,
  streak_day integer NOT NULL DEFAULT 0,
  xp_earned integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (creator_id, tracking_date)
);

ALTER TABLE public.creator_consistency_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their own consistency tracking"
  ON public.creator_consistency_tracking FOR SELECT
  USING (creator_id = get_my_profile_id());

CREATE POLICY "Admins can manage all consistency tracking"
  ON public.creator_consistency_tracking FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Consistency milestones table
CREATE TABLE public.consistency_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number integer NOT NULL UNIQUE,
  xp_reward integer NOT NULL,
  display_cash_value numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.consistency_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view milestones"
  ON public.consistency_milestones FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage milestones"
  ON public.consistency_milestones FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed milestones
INSERT INTO public.consistency_milestones (day_number, xp_reward, display_cash_value) VALUES
  (1, 100, 1.00),
  (2, 150, 1.50),
  (3, 200, 2.00),
  (4, 300, 3.00),
  (5, 500, 5.00),
  (6, 750, 7.50),
  (7, 1000, 10.00),
  (8, 1200, 12.00),
  (9, 1500, 15.00),
  (10, 2000, 20.00),
  (11, 2000, 20.00),
  (12, 2200, 22.00),
  (13, 2200, 22.00),
  (14, 2500, 25.00),
  (15, 2500, 25.00),
  (16, 2700, 27.00),
  (17, 2700, 27.00),
  (18, 3000, 30.00),
  (19, 3000, 30.00),
  (20, 3500, 35.00),
  (21, 5000, 50.00),
  (22, 5000, 50.00),
  (23, 5000, 50.00),
  (24, 5500, 55.00),
  (25, 6000, 60.00),
  (26, 6500, 65.00),
  (27, 7000, 70.00),
  (28, 7500, 75.00),
  (29, 8500, 85.00),
  (30, 10000, 100.00);

-- Reward shop items table
CREATE TABLE public.reward_shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  xp_cost integer NOT NULL,
  reward_type text NOT NULL DEFAULT 'cash',
  cash_value numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active shop items"
  ON public.reward_shop_items FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Admins can manage shop items"
  ON public.reward_shop_items FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Reward redemptions table
CREATE TABLE public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shop_item_id uuid NOT NULL REFERENCES public.reward_shop_items(id),
  xp_spent integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their own redemptions"
  ON public.reward_redemptions FOR SELECT
  USING (creator_id = get_my_profile_id());

CREATE POLICY "Creators can insert their own redemptions"
  ON public.reward_redemptions FOR INSERT
  WITH CHECK (creator_id = get_my_profile_id());

CREATE POLICY "Admins can manage all redemptions"
  ON public.reward_redemptions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed some default shop items
INSERT INTO public.reward_shop_items (title, description, xp_cost, reward_type, cash_value) VALUES
  ('Cash Out $5', 'Trade your XP for $5 cash', 500, 'cash', 5.00),
  ('Cash Out $10', 'Trade your XP for $10 cash', 1000, 'cash', 10.00),
  ('Cash Out $25', 'Trade your XP for $25 cash', 2500, 'cash', 25.00),
  ('Cash Out $50', 'Trade your XP for $50 cash', 5000, 'cash', 50.00),
  ('Cash Out $100', 'Trade your XP for $100 cash', 10000, 'cash', 100.00),
  ('Priority Review', 'Get your next video reviewed first', 300, 'priority', null),
  ('Commission Boost (1 week)', 'Boost your commission rate by 2% for one week', 2000, 'boost', null);

-- Updated trigger function to handle consistency tracking
CREATE OR REPLACE FUNCTION public.update_streak_on_video_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  today_str date := CURRENT_DATE;
  yesterday_str date := CURRENT_DATE - 1;
  rec record;
  v_upload_count integer;
  v_consecutive_days integer;
  v_xp_reward integer;
  v_milestone record;
BEGIN
  -- Get current gamification record
  SELECT current_streak, longest_streak, last_activity_date
  INTO rec
  FROM creator_gamification
  WHERE creator_id = NEW.creator_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO creator_gamification (creator_id, current_streak, longest_streak, last_activity_date, total_xp)
    VALUES (NEW.creator_id, 1, 1, today_str, 10);
    -- Also track consistency
    INSERT INTO creator_consistency_tracking (creator_id, tracking_date, upload_count)
    VALUES (NEW.creator_id, today_str, 1)
    ON CONFLICT (creator_id, tracking_date) DO UPDATE SET upload_count = creator_consistency_tracking.upload_count + 1;
    RETURN NEW;
  END IF;

  -- Update consistency tracking (always increment upload count)
  INSERT INTO creator_consistency_tracking (creator_id, tracking_date, upload_count)
  VALUES (NEW.creator_id, today_str, 1)
  ON CONFLICT (creator_id, tracking_date) DO UPDATE SET upload_count = creator_consistency_tracking.upload_count + 1
  RETURNING upload_count INTO v_upload_count;

  -- Check if they just hit 3 uploads (consistency threshold)
  IF v_upload_count = 3 THEN
    -- Calculate consecutive consistent days (including today)
    SELECT COUNT(*) INTO v_consecutive_days
    FROM (
      SELECT tracking_date
      FROM creator_consistency_tracking
      WHERE creator_id = NEW.creator_id
        AND is_consistent = true
        AND tracking_date < today_str
      ORDER BY tracking_date DESC
    ) sub
    WHERE tracking_date = today_str - (row_number() OVER ())::integer;
    
    -- Add 1 for today
    v_consecutive_days := v_consecutive_days + 1;

    -- Look up milestone reward (use exact day or nearest lower)
    SELECT xp_reward INTO v_xp_reward
    FROM consistency_milestones
    WHERE day_number <= v_consecutive_days AND is_active = true
    ORDER BY day_number DESC
    LIMIT 1;

    IF v_xp_reward IS NULL THEN
      v_xp_reward := 100; -- Fallback to Day 1 value
    END IF;

    -- Mark today as consistent and record reward
    UPDATE creator_consistency_tracking
    SET is_consistent = true, streak_day = v_consecutive_days, xp_earned = v_xp_reward
    WHERE creator_id = NEW.creator_id AND tracking_date = today_str;

    -- Award XP
    UPDATE creator_gamification
    SET total_xp = total_xp + v_xp_reward,
        redeemable_xp = redeemable_xp + v_xp_reward,
        current_level = calculate_level(total_xp + v_xp_reward),
        updated_at = now()
    WHERE creator_id = NEW.creator_id;
  END IF;

  -- Original streak logic (unchanged)
  IF rec.last_activity_date = today_str THEN
    RETURN NEW;
  END IF;

  IF rec.last_activity_date = yesterday_str THEN
    UPDATE creator_gamification
    SET current_streak = rec.current_streak + 1,
        longest_streak = GREATEST(rec.longest_streak, rec.current_streak + 1),
        last_activity_date = today_str,
        total_xp = total_xp + 10,
        updated_at = now()
    WHERE creator_id = NEW.creator_id;
  ELSE
    UPDATE creator_gamification
    SET current_streak = 1,
        longest_streak = GREATEST(rec.longest_streak, 1),
        last_activity_date = today_str,
        total_xp = total_xp + 10,
        updated_at = now()
    WHERE creator_id = NEW.creator_id;
  END IF;

  RETURN NEW;
END;
$function$;
