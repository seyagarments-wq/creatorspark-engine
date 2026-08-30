
-- Drop redundant narrower policies
DROP POLICY IF EXISTS "Authenticated users can view admin profiles" ON public.profiles;
DROP POLICY IF EXISTS "Mentors can view assigned creator profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Add universal read policy for all authenticated users
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
