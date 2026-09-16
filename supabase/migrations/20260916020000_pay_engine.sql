-- Pay engine: flat $65 per approved non-bounty video, accrued on approval into a per-video
-- ledger; a percentage bonus on attributed revenue; a payout cycle of 28 days anchored on each
-- creator's FIRST APPROVED video; payouts opened as `pending` for a human to pay. Nothing here
-- moves money. Decisions: Brain, app-development/pay-rework-execution-plan.md (2026-09-15).

-- ---------------------------------------------------------------------------------------------
-- 1. Rates live in settings, not in code. Bands: the rate applies to the whole revenue.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.settings (key, value)
VALUES ('pay_rates', '{"per_video": 65, "bonus_bands": [{"min": 0, "rate": 3}, {"min": 10000, "rate": 4}, {"min": 50000, "rate": 5}]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- 2. Per-creator cycle anchor.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_video_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_cycle_days integer NOT NULL DEFAULT 28;

UPDATE public.profiles p
SET first_video_at = sub.first_approved
FROM (
  SELECT creator_id, MIN(COALESCE(approved_at, updated_at, created_at)) AS first_approved
  FROM public.videos WHERE status = 'approved' GROUP BY creator_id
) sub
WHERE sub.creator_id = p.id AND p.first_video_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- 3. payouts: period columns, PayPal id in its own column, updated_at.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS video_count integer,
  ADD COLUMN IF NOT EXISTS paypal_batch_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_payouts_updated_at ON public.payouts;
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS payouts_one_per_creator_period_type
  ON public.payouts (creator_id, payout_type, period_start)
  WHERE period_start IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 4. The ledger: one row per approved non-bounty video.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL UNIQUE REFERENCES public.videos(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  rate_at_accrual numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'reversed', 'paid')),
  accrued_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  paid_at timestamptz,
  payout_id uuid REFERENCES public.payouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_earnings_creator_status_idx ON public.video_earnings (creator_id, status);
CREATE INDEX IF NOT EXISTS video_earnings_payout_idx ON public.video_earnings (payout_id);

ALTER TABLE public.video_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creators can view their own earnings" ON public.video_earnings;
CREATE POLICY "Creators can view their own earnings" ON public.video_earnings
  FOR SELECT USING (creator_id = public.get_my_profile_id());
DROP POLICY IF EXISTS "Admins can manage all earnings" ON public.video_earnings;
CREATE POLICY "Admins can manage all earnings" ON public.video_earnings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_video_earnings_updated_at ON public.video_earnings;
CREATE TRIGGER update_video_earnings_updated_at BEFORE UPDATE ON public.video_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------------------------
-- 5. Helpers: current rates.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_rate_per_video()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value->>'per_video')::numeric FROM public.settings WHERE key = 'pay_rates'), 65);
$$;

-- Rate (percent) for a revenue total: the band with the largest `min` that is <= revenue.
CREATE OR REPLACE FUNCTION public.bonus_rate_for(p_revenue numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT (b->>'rate')::numeric
    FROM public.settings s, jsonb_array_elements(s.value->'bonus_bands') b
    WHERE s.key = 'pay_rates' AND (b->>'min')::numeric <= COALESCE(p_revenue, 0)
    ORDER BY (b->>'min')::numeric DESC
    LIMIT 1
  ), 3);
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Only admins (or the service role) may approve. Closes the hole where creators could update
--    their own pending videos and mentors could update assigned ones with no column limits.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_video_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only an admin can approve a video.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_video_approval ON public.videos;
CREATE TRIGGER guard_video_approval BEFORE INSERT OR UPDATE OF status ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.guard_video_approval();

-- ---------------------------------------------------------------------------------------------
-- 7. Accrue on approval, reverse before payment, refuse after payment. One hook for every
--    approval path (two admin pages, the AI tool, bulk approve).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_video_earnings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rate numeric;
  v_row public.video_earnings%ROWTYPE;
  v_was_approved boolean := (TG_OP = 'UPDATE' AND OLD.status = 'approved');
  v_is_approved boolean := (NEW.status = 'approved');
  v_earns boolean := (NEW.status = 'approved' AND NEW.bounty_id IS NULL);
BEGIN
  -- Anchor the payout cycle on the first approval.
  IF v_is_approved AND NOT v_was_approved THEN
    UPDATE public.profiles SET first_video_at = COALESCE(NEW.approved_at, now())
      WHERE id = NEW.creator_id AND first_video_at IS NULL;
    IF NEW.approved_at IS NULL THEN
      UPDATE public.videos SET approved_at = now() WHERE id = NEW.id;
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.video_earnings WHERE video_id = NEW.id;

  IF v_earns THEN
    IF v_row.id IS NULL THEN
      v_rate := public.pay_rate_per_video();
      INSERT INTO public.video_earnings (video_id, creator_id, amount, rate_at_accrual)
      VALUES (NEW.id, NEW.creator_id, v_rate, v_rate);
    ELSIF v_row.status = 'reversed' THEN
      v_rate := public.pay_rate_per_video();
      UPDATE public.video_earnings
        SET status = 'accrued', amount = v_rate, rate_at_accrual = v_rate,
            accrued_at = now(), reversed_at = NULL, payout_id = NULL
        WHERE id = v_row.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Not earning any more (un-approved, rejected, saved for later, or tagged to a bounty).
  IF v_row.id IS NOT NULL AND v_row.status = 'accrued' THEN
    IF v_row.payout_id IS NOT NULL THEN
      -- Linked to a payout that is not paid yet: take it back out of that payout.
      UPDATE public.payouts
        SET amount = GREATEST(amount - v_row.amount, 0),
            video_count = GREATEST(COALESCE(video_count, 1) - 1, 0)
        WHERE id = v_row.payout_id AND status <> 'paid';
    END IF;
    UPDATE public.video_earnings
      SET status = 'reversed', reversed_at = now(), payout_id = NULL
      WHERE id = v_row.id;
  ELSIF v_row.id IS NOT NULL AND v_row.status = 'paid' THEN
    RAISE EXCEPTION 'This video has already been paid out and cannot be un-approved.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS handle_video_earnings ON public.videos;
CREATE TRIGGER handle_video_earnings AFTER INSERT OR UPDATE OF status, bounty_id ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.handle_video_earnings();

-- ---------------------------------------------------------------------------------------------
-- 8. When a video_pay payout is paid, its ledger rows are paid. When it is rejected, they go
--    back to the pool for the next cycle.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_payout_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payout_type <> 'video_pay' THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.video_earnings SET status = 'paid', paid_at = COALESCE(NEW.paid_at, now())
      WHERE payout_id = NEW.id AND status = 'accrued';
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    UPDATE public.video_earnings SET payout_id = NULL WHERE payout_id = NEW.id AND status = 'accrued';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS handle_payout_status ON public.payouts;
CREATE TRIGGER handle_payout_status AFTER UPDATE OF status ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.handle_payout_status();

-- ---------------------------------------------------------------------------------------------
-- 9. Backfill the ledger for videos approved before this migration existed. (None on
--    production as of 2026-09-16; matters for staging seeds and for safety.)
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.video_earnings (video_id, creator_id, amount, rate_at_accrual, accrued_at)
SELECT v.id, v.creator_id, public.pay_rate_per_video(), public.pay_rate_per_video(), COALESCE(v.approved_at, v.updated_at, v.created_at)
FROM public.videos v
WHERE v.status = 'approved' AND v.bounty_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.video_earnings e WHERE e.video_id = v.id);

-- ---------------------------------------------------------------------------------------------
-- 10. Open due payouts. Runs daily (cron) and on demand (edge function payout-cycle).
--     dry_run = true returns what it WOULD do and writes nothing.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_due_payouts(p_dry_run boolean DEFAULT false, p_creator_id uuid DEFAULT NULL)
RETURNS TABLE (
  creator_id uuid,
  creator_name text,
  period_start date,
  period_end date,
  video_count integer,
  video_pay numeric,
  attributed_revenue numeric,
  bonus_rate numeric,
  bonus_pay numeric,
  action text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  v_anchor date;
  v_cycle integer;
  v_n integer;
  v_ps date;
  v_pe date;
  v_ids uuid[];
  v_count integer;
  v_pay numeric;
  v_rev numeric;
  v_rate numeric;
  v_bonus numeric;
  v_payout_id uuid;
  v_did_anything boolean;
  a record;
BEGIN
  FOR c IN
    SELECT p.id, p.full_name, p.first_video_at, p.payout_cycle_days
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'creator'
    WHERE p.first_video_at IS NOT NULL
      AND (p_creator_id IS NULL OR p.id = p_creator_id)
  LOOP
    v_anchor := (c.first_video_at AT TIME ZONE 'UTC')::date;
    v_cycle := GREATEST(COALESCE(c.payout_cycle_days, 28), 7);
    v_n := 0;
    LOOP
      v_ps := v_anchor + (v_n * v_cycle);
      v_pe := v_ps + v_cycle - 1;
      EXIT WHEN v_pe >= current_date;   -- period not complete yet
      v_n := v_n + 1;
      EXIT WHEN v_n > 60;               -- safety

      IF EXISTS (SELECT 1 FROM public.payouts x WHERE x.creator_id = c.id AND x.payout_type IN ('video_pay', 'bonus') AND x.period_start = v_ps) THEN
        CONTINUE;
      END IF;

      -- Unpaid accruals up to the end of this period (older strays roll in too).
      SELECT COALESCE(array_agg(e.id), '{}'), COUNT(*), COALESCE(SUM(e.amount), 0)
        INTO v_ids, v_count, v_pay
      FROM public.video_earnings e
      WHERE e.creator_id = c.id AND e.status = 'accrued' AND e.payout_id IS NULL
        AND (e.accrued_at AT TIME ZONE 'UTC')::date <= v_pe;

      -- Attributed revenue across every video of theirs in the period.
      SELECT COALESCE(SUM(pd.revenue), 0) INTO v_rev
      FROM public.performance_data pd
      JOIN public.videos v ON v.id = pd.video_id
      WHERE v.creator_id = c.id AND pd.metric_date BETWEEN v_ps AND v_pe;

      v_rate := public.bonus_rate_for(v_rev);
      v_bonus := ROUND(v_rev * v_rate / 100.0, 2);

      creator_id := c.id; creator_name := c.full_name; period_start := v_ps; period_end := v_pe;
      video_count := v_count; video_pay := v_pay; attributed_revenue := v_rev; bonus_rate := v_rate; bonus_pay := v_bonus;

      IF v_pay <= 0 AND v_bonus <= 0 THEN
        action := 'nothing to pay';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF p_dry_run THEN
        action := 'would open';
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_did_anything := false;
      IF v_pay > 0 THEN
        INSERT INTO public.payouts (creator_id, amount, payout_type, status, notes, period_start, period_end, video_count)
        VALUES (c.id, v_pay, 'video_pay', 'pending',
                format('%s approved video%s from %s to %s. Awaiting review.', v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END, v_ps, v_pe),
                v_ps, v_pe, v_count)
        RETURNING id INTO v_payout_id;
        UPDATE public.video_earnings SET payout_id = v_payout_id WHERE id = ANY(v_ids);
        v_did_anything := true;
      END IF;
      IF v_bonus > 0 THEN
        INSERT INTO public.payouts (creator_id, amount, payout_type, status, notes, period_start, period_end)
        VALUES (c.id, v_bonus, 'bonus', 'pending',
                format('%s%% bonus on $%s attributed revenue from %s to %s. Awaiting review.', v_rate, v_rev, v_ps, v_pe),
                v_ps, v_pe);
        v_did_anything := true;
      END IF;

      IF v_did_anything THEN
        FOR a IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LOOP
          INSERT INTO public.notifications (user_id, title, message, notification_type, link)
          VALUES (a.user_id,
                  format('Payout due: %s', c.full_name),
                  format('%s finished a pay cycle (%s to %s): %s approved video%s for $%s%s. Review it and press Pay when ready.',
                         c.full_name, v_ps, v_pe, v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END, v_pay,
                         CASE WHEN v_bonus > 0 THEN format(', plus a $%s bonus (%s%% of $%s)', v_bonus, v_rate, v_rev) ELSE '' END),
                  'payout', '/admin/payouts');
        END LOOP;
      END IF;

      action := 'opened';
      RETURN NEXT;
    END LOOP;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.open_due_payouts(boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_due_payouts(boolean, uuid) TO service_role;

-- Daily, 06:15 UTC. No HTTP, no keys: pure SQL.
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'open-due-payouts-daily' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
  PERFORM cron.schedule('open-due-payouts-daily', '15 6 * * *', 'SELECT public.open_due_payouts(false)');
END $$;
