revoke execute on function public.guard_delivery_assignment_provider_conflict() from anon;
revoke execute on function public.guard_service_dispatch_provider_conflict() from anon;
revoke execute on function public.respond_service_dispatch_offer(uuid, text) from anon;
revoke execute on function public.start_service_dispatch(uuid) from anon;
revoke execute on function public.update_provider_location(numeric, numeric, numeric, timestamptz) from anon;
