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
  v_cohort_id uuid;
  v_cohort_total integer;
  v_cohort_consistent integer;
  v_bonus_xp integer;
BEGIN
  SELECT current_streak, longest_streak, last_activity_date
  INTO rec
  FROM creator_gamification
  WHERE creator_id = NEW.creator_id;

  IF NOT FOUND THEN
    INSERT INTO creator_gamification (creator_id, current_streak, longest_streak, last_activity_date, total_xp)
    VALUES (NEW.creator_id, 1, 1, today_str, 10);
    INSERT INTO creator_consistency_tracking (creator_id, tracking_date, upload_count)
    VALUES (NEW.creator_id, today_str, 1)
    ON CONFLICT (creator_id, tracking_date) DO UPDATE SET upload_count = creator_consistency_tracking.upload_count + 1;
    RETURN NEW;
  END IF;

  INSERT INTO creator_consistency_tracking (creator_id, tracking_date, upload_count)
  VALUES (NEW.creator_id, today_str, 1)
  ON CONFLICT (creator_id, tracking_date) DO UPDATE SET upload_count = creator_consistency_tracking.upload_count + 1
  RETURNING upload_count INTO v_upload_count;

  IF v_upload_count = 3 THEN
    SELECT COUNT(*) INTO v_consecutive_days
    FROM (
      SELECT tracking_date,
             row_number() OVER (ORDER BY tracking_date DESC) AS rn
      FROM creator_consistency_tracking
      WHERE creator_id = NEW.creator_id
        AND is_consistent = true
        AND tracking_date < today_str
    ) sub
    WHERE sub.tracking_date = today_str - sub.rn::integer;

    v_consecutive_days := v_consecutive_days + 1;

    SELECT xp_reward INTO v_xp_reward
    FROM consistency_milestones
    WHERE day_number <= v_consecutive_days AND is_active = true
    ORDER BY day_number DESC
    LIMIT 1;

    IF v_xp_reward IS NULL THEN
      v_xp_reward := 100;
    END IF;

    UPDATE creator_consistency_tracking
    SET is_consistent = true, streak_day = v_consecutive_days, xp_earned = v_xp_reward
    WHERE creator_id = NEW.creator_id AND tracking_date = today_str;

    UPDATE creator_gamification
    SET total_xp = total_xp + v_xp_reward,
        redeemable_xp = redeemable_xp + v_xp_reward,
        current_level = calculate_level(total_xp + v_xp_reward),
        updated_at = now()
    WHERE creator_id = NEW.creator_id;

    SELECT ccm.cohort_id INTO v_cohort_id
    FROM creator_cohort_members ccm
    WHERE ccm.creator_id = NEW.creator_id
    LIMIT 1;

    IF v_cohort_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_cohort_total
      FROM creator_cohort_members
      WHERE cohort_id = v_cohort_id;

      SELECT COUNT(*) INTO v_cohort_consistent
      FROM creator_cohort_members ccm
      JOIN creator_consistency_tracking cct ON cct.creator_id = ccm.creator_id
      WHERE ccm.cohort_id = v_cohort_id
        AND cct.tracking_date = today_str
        AND cct.is_consistent = true;

      IF v_cohort_consistent = v_cohort_total AND v_cohort_total > 1 THEN
        UPDATE creator_consistency_tracking cct
        SET cohort_multiplier_applied = true,
            multiplied_xp_earned = cct.xp_earned * 4
        FROM creator_cohort_members ccm
        WHERE ccm.cohort_id = v_cohort_id
          AND cct.creator_id = ccm.creator_id
          AND cct.tracking_date = today_str
          AND cct.is_consistent = true
          AND cct.cohort_multiplier_applied = false;

        FOR rec IN
          SELECT cct.creator_id, cct.xp_earned * 4 as bonus
          FROM creator_consistency_tracking cct
          JOIN creator_cohort_members ccm ON ccm.creator_id = cct.creator_id
          WHERE ccm.cohort_id = v_cohort_id
            AND cct.tracking_date = today_str
            AND cct.multiplied_xp_earned > 0
        LOOP
          UPDATE creator_gamification
          SET total_xp = total_xp + rec.bonus,
              redeemable_xp = redeemable_xp + rec.bonus,
              current_level = calculate_level(total_xp + rec.bonus),
              updated_at = now()
          WHERE creator_id = rec.creator_id;
        END LOOP;
      END IF;
    END IF;
  END IF;

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