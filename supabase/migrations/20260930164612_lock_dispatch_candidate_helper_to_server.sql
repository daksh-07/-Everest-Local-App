-- Internal dispatch candidate ranking exposes provider-operational metadata and is
-- consumed only by trusted SECURITY DEFINER dispatch orchestration. Keep it off
-- the authenticated Data API surface.
revoke execute on function public.get_service_dispatch_candidates(uuid,integer)
from public, anon, authenticated;

grant execute on function public.get_service_dispatch_candidates(uuid,integer)
to service_role;
