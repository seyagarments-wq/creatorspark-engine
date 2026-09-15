-- Signup provisioning fix, part 1 of 2.
-- Token-scoped invite validation so the browser no longer needs SELECT on public.invites,
-- plus a service-role-only lookup used by the accept-invite edge function to claim auth users
-- that the old client-side signup created without a profile or role.
-- Part 2 (20260915130000) drops the anon SELECT policy once the frontend uses this RPC.

CREATE OR REPLACE FUNCTION public.validate_invite(_token text)
RETURNS TABLE (id uuid, email text, role public.app_role, expires_at timestamptz, brand_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.role, i.expires_at, i.brand_id
  FROM public.invites i
  WHERE i.token = _token
    AND i.used_at IS NULL
    AND i.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invite(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_user_id_for_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_user_id_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_id_for_email(text) TO service_role;
