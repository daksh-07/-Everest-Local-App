-- Allow trusted Edge Functions using the service role to read external discovery gates
-- and provider reference status. Client roles remain unchanged.
grant select on table public.external_feature_flags to service_role;
grant select on table public.external_business_references to service_role;
