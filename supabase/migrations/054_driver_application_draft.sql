-- Allow the onboarding wizard to start with a server-created empty draft.
-- This keeps Identity as step 1 without inventing personal or vehicle data.

create or replace function public.get_or_create_driver_application_draft()
returns uuid
language plpgsql security definer set search_path=public
as $$
declare aid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into aid from public.driver_applications where user_id=auth.uid() for update;
  if aid is not null then return aid; end if;
  insert into public.driver_applications(
    user_id,status,service_area,availability,notes,compliance_jurisdiction
  )
  values(auth.uid(),'DRAFT','Pending','Pending',null,'AU-NSW')
  returning id into aid;
  insert into public.driver_verifications(application_id) values(aid) on conflict(application_id) do nothing;
  insert into public.driver_compliance_checks(application_id,jurisdiction_code,requirement_code)
  select aid,'AU-NSW',requirement_code
  from public.driver_compliance_requirements
  where jurisdiction_code='AU-NSW' and active=true
  on conflict do nothing;
  return aid;
end;
$$;
revoke execute on function public.get_or_create_driver_application_draft() from public,anon;
grant execute on function public.get_or_create_driver_application_draft() to authenticated;
