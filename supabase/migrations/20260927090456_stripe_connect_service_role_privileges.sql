-- Restore the narrow service_role privileges required by the Stripe Connect
-- onboarding/synchronization Edge Function. RLS remains enabled for client roles.

grant select on table public.business_members to service_role;
grant select, update on table public.businesses to service_role;
grant select, update on table public.services to service_role;
grant select, update on table public.products to service_role;
