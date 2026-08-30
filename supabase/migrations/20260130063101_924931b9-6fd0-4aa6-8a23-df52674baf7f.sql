-- Allow all authenticated users to view basic profile info (for leaderboard)
CREATE POLICY "Authenticated users can view creator profile names"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = profiles.user_id 
    AND user_roles.role = 'creator'::app_role
  )
);