-- Allow authenticated users to see admin roles (so creators can find admins to message)
CREATE POLICY "Authenticated users can view admin roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role = 'admin');