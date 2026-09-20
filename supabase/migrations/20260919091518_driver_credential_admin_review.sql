create or replace function public.admin_set_driver_credential_details(
  p_application_id uuid,p_licence_status text,p_licence_expiry date,
  p_insurance_status text,p_insurance_provider text,p_insurance_policy_reference text,p_insurance_expiry date,
  p_verification_method text default 'MANUAL_ADMIN_CHECK',p_provider text default null,p_reference text default null
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_licence_status not in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid licence status'; end if;
  if p_insurance_status not in ('NOT_REQUIRED','PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid insurance status'; end if;
  if p_verification_method not in ('MANUAL_ADMIN_CHECK','OFFICIAL_API') then raise exception 'Invalid verification method'; end if;
  if p_licence_status='VERIFIED' and (p_licence_expiry is null or p_licence_expiry<current_date) then raise exception 'A verified licence must have a current expiry date'; end if;
  if p_insurance_status='VERIFIED' and (p_insurance_expiry is null or p_insurance_expiry<current_date) then raise exception 'Verified insurance must have a current expiry date'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  insert into public.driver_verifications(application_id) values(a.id) on conflict do nothing;
  update public.driver_verifications set licence_status=p_licence_status,licence_expiry=p_licence_expiry,insurance_status=p_insurance_status,insurance_provider=nullif(trim(coalesce(p_insurance_provider,'')),''),insurance_policy_reference=nullif(trim(coalesce(p_insurance_policy_reference,'')),''),insurance_expiry=p_insurance_expiry,verification_method=p_verification_method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),verification_reference=nullif(trim(coalesce(p_reference,'')),''),licence_verified_at=case when p_licence_status='VERIFIED' then now() else licence_verified_at end,licence_verified_by=case when p_licence_status='VERIFIED' then auth.uid() else licence_verified_by end,insurance_verified_at=case when p_insurance_status='VERIFIED' then now() else insurance_verified_at end,insurance_verified_by=case when p_insurance_status='VERIFIED' then auth.uid() else insurance_verified_by end,updated_at=now() where application_id=a.id;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata) values(a.id,auth.uid(),'CREDENTIAL_VERIFICATION_UPDATED',a.status,jsonb_build_object('licence_status',p_licence_status,'licence_expiry',p_licence_expiry,'insurance_status',p_insurance_status,'insurance_expiry',p_insurance_expiry,'method',p_verification_method,'provider',p_provider,'reference',p_reference));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,date,text,text,text) to authenticated;