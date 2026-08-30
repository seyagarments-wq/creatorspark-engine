
CREATE TABLE public.cohort_upload_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.creator_cohorts(id) ON DELETE CASCADE,
  required_weekdays INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  videos_per_day INT NOT NULL DEFAULT 4,
  max_misses_per_month INT NOT NULL DEFAULT 3,
  lock_day_of_week INT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, effective_from)
);

CREATE TABLE public.creator_daily_upload_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  approved_count INT NOT NULL DEFAULT 0,
  required_count INT NOT NULL DEFAULT 0,
  is_required_day BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','met','missed','excused')),
  locked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, date)
);
CREATE INDEX idx_daily_status_creator_date ON public.creator_daily_upload_status(creator_id, date DESC);

CREATE TABLE public.creator_monthly_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  required_days INT NOT NULL DEFAULT 0,
  met_days INT NOT NULL DEFAULT 0,
  missed_days INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track','at_risk','ineligible','eligible')),
  locked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, month)
);
CREATE INDEX idx_monthly_elig_creator_month ON public.creator_monthly_eligibility(creator_id, month DESC);

ALTER TABLE public.cohort_upload_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_daily_upload_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_monthly_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage schedules" ON public.cohort_upload_schedules FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Creators view their cohort schedule" ON public.cohort_upload_schedules FOR SELECT USING (
  cohort_id IN (SELECT get_my_cohort_ids())
);

CREATE POLICY "Admins manage daily status" ON public.creator_daily_upload_status FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Creators view own daily status" ON public.creator_daily_upload_status FOR SELECT USING (creator_id = get_my_profile_id());

CREATE POLICY "Admins manage monthly eligibility" ON public.creator_monthly_eligibility FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Creators view own monthly eligibility" ON public.creator_monthly_eligibility FOR SELECT USING (creator_id = get_my_profile_id());

CREATE TRIGGER update_cohort_upload_schedules_updated_at BEFORE UPDATE ON public.cohort_upload_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_creator_daily_upload_status_updated_at BEFORE UPDATE ON public.creator_daily_upload_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_creator_monthly_eligibility_updated_at BEFORE UPDATE ON public.creator_monthly_eligibility FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
