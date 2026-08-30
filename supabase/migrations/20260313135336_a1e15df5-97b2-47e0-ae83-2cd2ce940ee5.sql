
CREATE OR REPLACE FUNCTION public.update_streak_on_video_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today_str date := CURRENT_DATE;
  yesterday_str date := CURRENT_DATE - 1;
  rec record;
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
    RETURN NEW;
  END IF;

  -- Already logged activity today, skip
  IF rec.last_activity_date = today_str THEN
    RETURN NEW;
  END IF;

  -- Continue streak from yesterday
  IF rec.last_activity_date = yesterday_str THEN
    UPDATE creator_gamification
    SET current_streak = rec.current_streak + 1,
        longest_streak = GREATEST(rec.longest_streak, rec.current_streak + 1),
        last_activity_date = today_str,
        total_xp = total_xp + 10,
        updated_at = now()
    WHERE creator_id = NEW.creator_id;
  ELSE
    -- Streak broken or first activity, start fresh
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
$$;

CREATE TRIGGER trg_update_streak_on_video_insert
  AFTER INSERT ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_streak_on_video_insert();
