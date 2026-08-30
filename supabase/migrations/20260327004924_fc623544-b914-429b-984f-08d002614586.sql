CREATE POLICY "Creators can view cohort members consistency"
ON public.creator_consistency_tracking
FOR SELECT
TO authenticated
USING (
  creator_id IN (
    SELECT ccm2.creator_id
    FROM public.creator_cohort_members ccm1
    JOIN public.creator_cohort_members ccm2 ON ccm1.cohort_id = ccm2.cohort_id
    WHERE ccm1.creator_id = get_my_profile_id()
  )
);