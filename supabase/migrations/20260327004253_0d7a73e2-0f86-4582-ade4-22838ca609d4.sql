CREATE POLICY "Authenticated users can view creator roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role = 'creator'::app_role);