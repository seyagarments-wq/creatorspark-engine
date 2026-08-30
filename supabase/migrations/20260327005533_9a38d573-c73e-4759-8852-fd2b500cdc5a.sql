
-- Drop the recursive policy
DROP POLICY IF EXISTS "Creators can view fellow cohort members" ON public.creator_cohort_members;

-- Create a security definer function to get cohort IDs for a user
CREATE OR REPLACE FUNCTION public.get_my_cohort_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cohort_id FROM public.creator_cohort_members WHERE creator_id = get_my_profile_id()
$$;

-- Recreate policy using the function (no recursion)
CREATE POLICY "Creators can view fellow cohort members"
ON public.creator_cohort_members
FOR SELECT
TO authenticated
USING (
  cohort_id IN (SELECT public.get_my_cohort_ids())
);
