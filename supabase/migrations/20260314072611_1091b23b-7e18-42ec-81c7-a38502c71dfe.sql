DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Mentors can view assigned creator profiles'
  ) THEN
    DROP POLICY "Mentors can view assigned creator profiles" ON public.profiles;
  END IF;
END $$;

CREATE POLICY "Mentors can view assigned creator profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.mentor_creator_assignments mca
    WHERE mca.creator_id = profiles.id
      AND mca.mentor_id = public.get_my_profile_id()
      AND mca.status = 'active'
  )
);