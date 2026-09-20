-- Everest Local: require password authentication plus AAL2 MFA for admin access

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_identity()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as factor
      where factor ->> 'method' = 'password'
    );
$$;

create or replace function public.get_admin_auth_state()
returns jsonb
language sql
stable
security definer
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

revoke execute on function public.get_admin_auth_state() from public, anon;
grant execute on function public.get_admin_auth_state() to authenticated;
