CREATE POLICY "Creators can view fellow cohort members"
ON public.creator_cohort_members
FOR SELECT
TO authenticated
USING (
  cohort_id IN (
    SELECT ccm.cohort_id FROM public.creator_cohort_members ccm WHERE ccm.creator_id = get_my_profile_id()
  )
);