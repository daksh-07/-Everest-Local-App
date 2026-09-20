-- Keep RLS helper functions available to authenticated policy evaluation,
-- but do not expose their SECURITY DEFINER execution surface to anonymous callers.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid) FROM anon;
