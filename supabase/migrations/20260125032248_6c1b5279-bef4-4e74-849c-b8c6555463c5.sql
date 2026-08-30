-- Fix the overly permissive RLS policy on performance_digests
DROP POLICY IF EXISTS "Service role can manage digests" ON public.performance_digests;

-- Create proper insert policy for the system (edge functions use service role which bypasses RLS)
-- Admins can also insert digests if needed
CREATE POLICY "Admins can manage performance digests"
ON public.performance_digests
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Drop the redundant select-only policy since ALL covers it
DROP POLICY IF EXISTS "Admins can read performance digests" ON public.performance_digests;