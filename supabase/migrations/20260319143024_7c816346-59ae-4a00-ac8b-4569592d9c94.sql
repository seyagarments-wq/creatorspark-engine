
CREATE POLICY "Creators can view their own mentor assignments"
ON public.mentor_creator_assignments
FOR SELECT
TO authenticated
USING (creator_id = get_my_profile_id());
