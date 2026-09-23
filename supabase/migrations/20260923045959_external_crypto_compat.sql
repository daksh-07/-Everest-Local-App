-- Supabase installs pgcrypto in the extensions schema. The external-network
-- migrations deliberately pin SECURITY DEFINER search_path to empty and refer
-- to public.digest/public.gen_random_bytes, so provide tightly locked wrappers
-- before those migrations run. These helpers are not Data API entry points.

create or replace function public.digest(p_data text, p_type text)
returns bytea
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.digest(p_data, p_type);
$$;

create or replace function public.gen_random_bytes(p_count integer)
returns bytea
language sql
volatile
strict
parallel safe
set search_path = ''
as $$
  select extensions.gen_random_bytes(p_count);
$$;

revoke all on function public.digest(text,text) from public, anon, authenticated, service_role;
revoke all on function public.gen_random_bytes(integer) from public, anon, authenticated, service_role;
