-- The profile role guard is trigger-only and must not be callable through PostgREST.
revoke execute on function public.enforce_single_admin_identity() from public, anon, authenticated;
