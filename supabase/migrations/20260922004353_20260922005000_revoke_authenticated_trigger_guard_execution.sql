-- Trigger-only SECURITY DEFINER functions must not be callable through the PostgREST RPC surface.
-- PostgreSQL trigger execution does not require EXECUTE privilege for the invoking API role.
revoke execute on function public.guard_delivery_assignment_provider_conflict() from public, anon, authenticated;
revoke execute on function public.guard_service_dispatch_provider_conflict() from public, anon, authenticated;
