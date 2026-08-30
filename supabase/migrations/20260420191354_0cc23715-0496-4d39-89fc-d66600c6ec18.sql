
-- Agreements
CREATE TABLE public.agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','cohort','creator_list')),
  required BOOLEAN NOT NULL DEFAULT true,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accept_deadline TIMESTAMPTZ,
  created_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agreement_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.agreements(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES public.creator_cohorts(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cohort_id IS NOT NULL OR creator_id IS NOT NULL)
);
CREATE INDEX idx_agreement_targets_agreement ON public.agreement_targets(agreement_id);
CREATE INDEX idx_agreement_targets_cohort ON public.agreement_targets(cohort_id);
CREATE INDEX idx_agreement_targets_creator ON public.agreement_targets(creator_id);

CREATE TABLE public.agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.agreements(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  user_agent TEXT,
  ip TEXT,
  UNIQUE (agreement_id, creator_id)
);
CREATE INDEX idx_agreement_acceptances_creator ON public.agreement_acceptances(creator_id);

ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_acceptances ENABLE ROW LEVEL SECURITY;

-- Admin manage all
CREATE POLICY "Admins manage agreements" ON public.agreements FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage agreement_targets" ON public.agreement_targets FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage agreement_acceptances" ON public.agreement_acceptances FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Creators can view agreements targeted to them
CREATE POLICY "Creators view targeted agreements" ON public.agreements FOR SELECT USING (
  is_active = true AND (
    audience = 'all'
    OR EXISTS (
      SELECT 1 FROM public.agreement_targets t
      WHERE t.agreement_id = agreements.id
        AND (
          t.creator_id = get_my_profile_id()
          OR t.cohort_id IN (SELECT get_my_cohort_ids())
        )
    )
  )
);

CREATE POLICY "Creators view own targets" ON public.agreement_targets FOR SELECT USING (
  creator_id = get_my_profile_id() OR cohort_id IN (SELECT get_my_cohort_ids())
);

CREATE POLICY "Creators view own acceptances" ON public.agreement_acceptances FOR SELECT USING (
  creator_id = get_my_profile_id()
);
CREATE POLICY "Creators insert own acceptances" ON public.agreement_acceptances FOR INSERT WITH CHECK (
  creator_id = get_my_profile_id()
);

-- updated_at triggers
CREATE TRIGGER update_agreements_updated_at BEFORE UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: latest unaccepted required agreement for a creator
CREATE OR REPLACE FUNCTION public.get_pending_agreement_for_creator(_creator_id UUID)
RETURNS SETOF public.agreements
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.*
  FROM public.agreements a
  WHERE a.is_active = true
    AND a.required = true
    AND a.effective_at <= now()
    AND (
      a.audience = 'all'
      OR EXISTS (
        SELECT 1 FROM public.agreement_targets t
        WHERE t.agreement_id = a.id
          AND (
            t.creator_id = _creator_id
            OR t.cohort_id IN (SELECT cohort_id FROM public.creator_cohort_members WHERE creator_id = _creator_id)
          )
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agreement_acceptances ac
      WHERE ac.agreement_id = a.id AND ac.creator_id = _creator_id
    )
  ORDER BY a.effective_at DESC
  LIMIT 1
$$;
