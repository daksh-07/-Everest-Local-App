alter table public.driver_verifications
  add column if not exists licence_jurisdiction text,
  add column if not exists licence_number text,
  add column if not exists licence_class text,
  add column if not exists licence_expiry date,
  add column if not exists insurance_provider text,
  add column if not exists insurance_policy_reference text,
  add column if not exists insurance_expiry date;

create or replace function public.save_driver_verification_details(
  p_licence_jurisdiction text,p_licence_number text,p_licence_class text,p_licence_expiry date,
  p_insurance_provider text,p_insurance_policy_reference text,p_insurance_expiry date
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare aid uuid;
begin
  select id into aid from public.driver_applications where user_id=auth.uid();
  if aid is null then raise exception 'Start your driver application first'; end if;
  if (select status from public.driver_applications where id=aid) in ('APPROVED','SUSPENDED') then raise exception 'Verification details cannot be changed in the current application state'; end if;
  if p_licence_jurisdiction not in ('NSW','ACT','NT','QLD','SA','TAS','VIC','WA','OVERSEAS') then raise exception 'Select a valid licence jurisdiction'; end if;
  if length(trim(coalesce(p_licence_number,'')))<2 or length(trim(p_licence_number))>80 then raise exception 'Enter a valid licence number'; end if;
  if length(trim(coalesce(p_licence_class,'')))<1 or length(trim(p_licence_class))>40 then raise exception 'Enter a valid licence class'; end if;
  if p_licence_expiry is null then raise exception 'Enter your licence expiry date'; end if;
  if p_insurance_provider is not null and length(trim(p_insurance_provider))>120 then raise exception 'Insurance provider is too long'; end if;
  if p_insurance_policy_reference is not null and length(trim(p_insurance_policy_reference))>120 then raise exception 'Insurance policy reference is too long'; end if;
  if p_insurance_expiry is not null and p_insurance_expiry<current_date then raise exception 'Insurance expiry date cannot be in the past'; end if;
  insert into public.driver_verifications(application_id) values(aid) on conflict(application_id) do nothing;
  update public.driver_verifications set licence_jurisdiction=upper(trim(p_licence_jurisdiction)),licence_number=trim(p_licence_number),licence_class=trim(p_licence_class),licence_expiry=p_licence_expiry,insurance_provider=nullif(trim(coalesce(p_insurance_provider,'')),''),insurance_policy_reference=nullif(trim(coalesce(p_insurance_policy_reference,'')),''),insurance_expiry=p_insurance_expiry,updated_at=now() where application_id=aid;
  return true;
end;
$$;
revoke execute on function public.save_driver_verification_details(text,text,text,date,text,text,date) from public,anon;
grant execute on function public.save_driver_verification_details(text,text,text,date,text,text,date) to authenticated;

create or replace function public.save_driver_vehicle_details(
  p_registration_plate text,p_registration_state text,p_make text,p_model text,p_year integer,
  p_colour text,p_vehicle_type text,p_vin text,p_ownership_status text,p_registration_expiry date,
  p_ctp_provider text,p_ctp_expiry date
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare aid uuid; vid uuid;
begin
  select id into aid from public.driver_applications where user_id=auth.uid();
  if aid is null then raise exception 'Start your driver application first'; end if;
  if (select status from public.driver_applications where id=aid) in ('APPROVED','SUSPENDED') then raise exception 'Vehicle cannot be changed in the current application state'; end if;
  if length(trim(coalesce(p_registration_plate,'')))<2 or length(trim(p_registration_plate))>12 then raise exception 'Enter a valid registration plate'; end if;
  if length(trim(coalesce(p_registration_state,'')))<2 or length(trim(p_registration_state))>32 then raise exception 'Select a registration state'; end if;
  if length(trim(coalesce(p_make,'')))<2 or length(trim(coalesce(p_model,'')))<1 or length(trim(coalesce(p_vehicle_type,'')))<2 then raise exception 'Complete vehicle details'; end if;
  if p_year is not null and (p_year<1950 or p_year>extract(year from current_date)+1) then raise exception 'Enter a valid vehicle year'; end if;
  if p_ownership_status not in ('OWNER','AUTHORISED_USER','EMPLOYER_VEHICLE') then raise exception 'Select how you are authorised to use this vehicle'; end if;
  insert into public.driver_vehicles(application_id,user_id,registration_plate,registration_state,make,model,year,colour,vehicle_type,vin,ownership_status,registration_expiry,ctp_provider,ctp_expiry)
  values(aid,auth.uid(),upper(trim(p_registration_plate)),upper(trim(p_registration_state)),trim(p_make),trim(p_model),p_year,nullif(trim(p_colour),''),trim(p_vehicle_type),nullif(trim(p_vin),''),p_ownership_status,p_registration_expiry,nullif(trim(coalesce(p_ctp_provider,'')),''),p_ctp_expiry)
  on conflict(application_id) do update set registration_plate=excluded.registration_plate,registration_state=excluded.registration_state,make=excluded.make,model=excluded.model,year=excluded.year,colour=excluded.colour,vehicle_type=excluded.vehicle_type,vin=excluded.vin,ownership_status=excluded.ownership_status,registration_expiry=excluded.registration_expiry,ctp_provider=excluded.ctp_provider,ctp_expiry=excluded.ctp_expiry,status='PENDING',registration_status='PENDING',verification_method='MANUAL_ADMIN_CHECK',verification_provider=null,verification_reference=null,verified_at=null,verified_by=null,updated_at=now()
  returning id into vid;
  return vid;
end;
$$;
revoke execute on function public.save_driver_vehicle_details(text,text,text,text,integer,text,text,text,text,date,text,date) from public,anon;
grant execute on function public.save_driver_vehicle_details(text,text,text,text,integer,text,text,text,text,date,text,date) to authenticated;