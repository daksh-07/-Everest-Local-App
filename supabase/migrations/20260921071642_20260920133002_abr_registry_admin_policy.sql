drop policy if exists business_verifications_admin_select on public.business_verifications;

create policy business_verifications_admin_select
  on public.business_verifications
  for select
  to authenticated
  using ((select public.is_admin()));
