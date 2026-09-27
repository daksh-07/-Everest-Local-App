-- This function only inspects the caller's JWT and delegates the identity check
-- to the existing tightly scoped authorization helper; it does not need definer privileges.
create or replace function public.get_admin_auth_state()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'authorized_admin', public.is_admin_identity(),
    'password_authenticated', exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as factor
      where factor ->> 'method' = 'password'
    ),
    'mfa_verified', coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2',
    'admin', public.is_admin()
  );
$$;
