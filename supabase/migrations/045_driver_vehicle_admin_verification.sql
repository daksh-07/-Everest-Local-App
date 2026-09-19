create or replace function public.admin_set_driver_vehicle_verification(
  p_application_id uuid,p_registration_status text,p_registration_expiry date,
  p_ctp_provider text,p_ctp_expiry date,p_verification_method text default 'MANUAL_ADMIN_CHECK',
  p_provider text default null,p_reference text default null
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; v public.driver_vehicles;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_registration_status not in ('PENDING','CURRENT','EXPIRED','SUSPENDED','CANCELLED','REJECTED') then raise exception 'Invalid registration status'; end if;
  if p_verification_method not in ('MANUAL_ADMIN_CHECK','OFFICIAL_API') then raise exception 'Invalid verification method'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  select * into v from public.driver_vehicles where application_id=a.id for update;
  if v.id is null then raise exception 'Driver vehicle not found'; end if;
  update public.driver_vehicles
    set registration_expiry=p_registration_expiry,registration_status=p_registration_status,
        ctp_provider=nullif(trim(coalesce(p_ctp_provider,'')),''),ctp_expiry=p_ctp_expiry,
        verification_method=p_verification_method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),
        verification_reference=nullif(trim(coalesce(p_reference,'')),''),
        status=case when p_registration_status='CURRENT' then 'VERIFIED' when p_registration_status='EXPIRED' then 'EXPIRED' else 'REJECTED' end,
        verified_at=case when p_registration_status='CURRENT' then now() else verified_at end,
        verified_by=case when p_registration_status='CURRENT' then auth.uid() else verified_by end,
        updated_at=now()
  where id=v.id;
  update public.driver_verifications
    set registration_status=case when p_registration_status='CURRENT' then 'VERIFIED' when p_registration_status='EXPIRED' then 'EXPIRED' else 'REJECTED' end,
        verification_method=p_verification_method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),
        verification_reference=nullif(trim(coalesce(p_reference,'')),''),
        registration_verified_at=case when p_registration_status='CURRENT' then now() else registration_verified_at end,
        registration_verified_by=case when p_registration_status='CURRENT' then auth.uid() else registration_verified_by end,
        updated_at=now()
  where application_id=a.id;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata)
  values(a.id,auth.uid(),'VEHICLE_REGISTRATION_VERIFICATION',a.status,jsonb_build_object('registration_status',p_registration_status,'registration_expiry',p_registration_expiry,'ctp_provider',p_ctp_provider,'ctp_expiry',p_ctp_expiry,'method',p_verification_method,'provider',p_provider,'reference',p_reference));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_vehicle_verification(uuid,text,date,text,date,text,text,text) from public,anon;
grant execute on function public.admin_set_driver_vehicle_verification(uuid,text,date,text,date,text,text,text) to authenticated;