-- Restrict internal driver verification helpers to trusted server-side callers.
-- These functions are invoked by authoritative SECURITY DEFINER workflows and
-- should not be directly callable through the public PostgREST RPC surface.
revoke execute on function public.refresh_driver_verification_status(uuid) from anon, authenticated;
revoke execute on function public.evaluate_driver_compliance(uuid) from anon, authenticated;
revoke execute on function public.driver_is_operational(uuid) from anon, authenticated;
