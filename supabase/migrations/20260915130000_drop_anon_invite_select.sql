-- Signup provisioning fix, part 2 of 2. Apply only after the frontend that calls
-- validate_invite() (20260915120000) is live in production, since the old Landing.tsx read
-- public.invites directly and would break without this policy.
--
-- With this policy in place the public anon key could list every pending invite with its
-- token, which is enough to sign up as any invited creator.
DROP POLICY IF EXISTS "Anyone can validate invite tokens" ON public.invites;
