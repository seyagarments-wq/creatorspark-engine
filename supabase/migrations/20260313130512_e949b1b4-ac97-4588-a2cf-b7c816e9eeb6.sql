ALTER TABLE public.bounties ADD COLUMN cohort_id uuid REFERENCES public.creator_cohorts(id) ON DELETE SET NULL DEFAULT NULL;
ALTER TABLE public.videos DROP COLUMN IF EXISTS challenge_id;