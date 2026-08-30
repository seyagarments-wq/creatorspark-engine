
-- Phase 1: Creator Cohorts

-- Create creator_cohorts table
CREATE TABLE public.creator_cohorts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create creator_cohort_members junction table
CREATE TABLE public.creator_cohort_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES public.creator_cohorts(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cohort_id, creator_id)
);

-- Enable RLS
ALTER TABLE public.creator_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_cohort_members ENABLE ROW LEVEL SECURITY;

-- Cohorts: Admins full access
CREATE POLICY "Admins can manage cohorts"
  ON public.creator_cohorts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Cohorts: Creators can view cohorts they belong to
CREATE POLICY "Creators can view their cohorts"
  ON public.creator_cohorts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.creator_cohort_members
    WHERE creator_cohort_members.cohort_id = creator_cohorts.id
      AND creator_cohort_members.creator_id = get_my_profile_id()
  ));

-- Members: Admins full access
CREATE POLICY "Admins can manage cohort members"
  ON public.creator_cohort_members FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Members: Creators can view their own memberships
CREATE POLICY "Creators can view their memberships"
  ON public.creator_cohort_members FOR SELECT
  USING (creator_id = get_my_profile_id());

-- Trigger for updated_at on cohorts
CREATE TRIGGER update_creator_cohorts_updated_at
  BEFORE UPDATE ON public.creator_cohorts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
