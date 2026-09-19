-- Extend normalized driver verification metadata without reintroducing legacy vehicle fields.

drop function if exists public.save_driver_verification_details(text,text,text,date,text,text,date);
create or replace function public.save_driver_verification_details(
  p_licence_jurisdiction text,p_licence_number text,p_licence_class text,p_licence_expiry date,
  p_licence_restrictions text,p_insurance_provider text,p_insurance_policy_reference text,
  p_insurance_type text,p_insurance_expiry date
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
  if p_licence_restrictions is not null and length(trim(p_licence_restrictions))>500 then raise exception 'Licence restrictions are too long'; end if;
  if p_insurance_provider is not null and length(trim(p_insurance_provider))>120 then raise exception 'Insurance provider is too long'; end if;
  if p_insurance_policy_reference is not null and length(trim(p_insurance_policy_reference))>120 then raise exception 'Insurance policy reference is too long'; end if;
  if p_insurance_type is not null and p_insurance_type not in ('CTP','ADDITIONAL_MOTOR','COMMERCIAL_BUSINESS_USE','OTHER') then raise exception 'Invalid insurance type'; end if;
  if p_insurance_expiry is not null and p_insurance_expiry<current_date then raise exception 'Insurance expiry date cannot be in the past'; end if;
  insert into public.driver_verifications(application_id) values(aid) on conflict(application_id) do nothing;
  update public.driver_verifications set
    licence_jurisdiction=upper(trim(p_licence_jurisdiction)),
    licence_number=trim(p_licence_number),
    licence_class=trim(p_licence_class),
    licence_expiry=p_licence_expiry,
    licence_restrictions=nullif(trim(p_licence_restrictions),''),
    insurance_provider=nullif(trim(coalesce(p_insurance_provider,'')),''),
    insurance_policy_reference=nullif(trim(coalesce(p_insurance_policy_reference,'')),''),
    insurance_type=nullif(trim(coalesce(p_insurance_type,'')),''),
    insurance_expiry=p_insurance_expiry,
    updated_at=now()
  where application_id=aid;
  return true;
end;
$$;
revoke execute on function public.save_driver_verification_details(text,text,text,date,text,text,text,text,date) from public,anon;
grant execute on function public.save_driver_verification_details(text,text,text,date,text,text,text,text,date) to authenticated;

drop function if exists public.save_driver_vehicle_details(text,text,text,text,integer,text,text,text,text,date,text,date);
create or replace function public.save_driver_vehicle_details(
  p_registration_plate text,p_registration_state text,p_make text,p_model text,p_year integer,
  p_colour text,p_vehicle_type text,p_vin text,p_ownership_status text,p_registration_expiry date,
  p_registration_restrictions text,p_ctp_provider text,p_ctp_expiry date
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
  if p_registration_restrictions is not null and length(trim(p_registration_restrictions))>500 then raise exception 'Registration restrictions are too long'; end if;
  insert into public.driver_vehicles(
    application_id,user_id,registration_plate,registration_state,make,model,year,colour,
    vehicle_type,vin,ownership_status,registration_expiry,registration_restrictions,ctp_provider,ctp_expiry
  )
  values(
    aid,auth.uid(),upper(trim(p_registration_plate)),upper(trim(p_registration_state)),trim(p_make),
    trim(p_model),p_year,nullif(trim(p_colour),''),trim(p_vehicle_type),nullif(trim(p_vin),''),
    p_ownership_status,p_registration_expiry,nullif(trim(p_registration_restrictions),''),
    nullif(trim(coalesce(p_ctp_provider,'')),''),p_ctp_expiry
  )
  on conflict(application_id) do update set
    registration_plate=excluded.registration_plate,registration_state=excluded.registration_state,
    make=excluded.make,model=excluded.model,year=excluded.year,colour=excluded.colour,
    vehicle_type=excluded.vehicle_type,vin=excluded.vin,ownership_status=excluded.ownership_status,
    registration_expiry=excluded.registration_expiry,registration_restrictions=excluded.registration_restrictions,
    ctp_provider=excluded.ctp_provider,ctp_expiry=excluded.ctp_expiry,status='PENDING',
    registration_status='PENDING',verification_method='MANUAL_ADMIN_CHECK',
    verification_provider=null,verification_reference=null,verified_at=null,verified_by=null,updated_at=now()
  returning id into vid;
  return vid;
end;
$$;
revoke execute on function public.save_driver_vehicle_details(text,text,text,text,integer,text,text,text,text,date,text,text,date) from public,anon;
grant execute on function public.save_driver_vehicle_details(text,text,text,text,integer,text,text,text,text,date,text,text,date) to authenticated;

drop function if exists public.admin_set_driver_vehicle_verification(uuid,text,date,text,date,text,text,text);
create or replace function public.admin_set_driver_vehicle_verification(
  p_application_id uuid,p_registration_status text,p_registration_expiry date,
  p_registration_restrictions text,p_ctp_provider text,p_ctp_expiry date,
  p_verification_method text default 'MANUAL_ADMIN_CHECK',
  p_provider text default null,p_reference text default null
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; v public.driver_vehicles; method text;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_registration_status not in ('PENDING','CURRENT','EXPIRED','SUSPENDED','CANCELLED','REJECTED') then raise exception 'Invalid registration status'; end if;
  if p_verification_method not in ('MANUAL_ADMIN_CHECK','OFFICIAL_API') then raise exception 'Invalid verification method'; end if;
  if p_registration_status='CURRENT' and (p_registration_expiry is null or p_registration_expiry<current_date) then raise exception 'Current registration requires a current expiry date'; end if;
  if p_registration_restrictions is not null and length(trim(p_registration_restrictions))>500 then raise exception 'Registration restrictions are too long'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  select * into v from public.driver_vehicles where application_id=a.id for update;
  if v.id is null then raise exception 'Driver vehicle not found'; end if;
  method:=case when p_verification_method='OFFICIAL_API' then 'OFFICIAL_API' else 'MANUAL_REVIEW_REQUIRED' end;
  update public.driver_vehicles set
    registration_expiry=p_registration_expiry,registration_status=p_registration_status,
    registration_restrictions=nullif(trim(p_registration_restrictions),''),
    ctp_provider=nullif(trim(coalesce(p_ctp_provider,'')),''),
    ctp_expiry=p_ctp_expiry,verification_method=p_verification_method,
    verification_provider=nullif(trim(coalesce(p_provider,'')),''),
    verification_reference=nullif(trim(coalesce(p_reference,'')),''),
    status=case when p_registration_status='CURRENT' and p_ctp_expiry is not null and p_ctp_expiry>=current_date then 'VERIFIED'
                when p_registration_status='EXPIRED' or p_ctp_expiry<current_date then 'EXPIRED'
                else 'PENDING' end,
    verified_at=case when p_registration_status='CURRENT' and p_ctp_expiry is not null and p_ctp_expiry>=current_date then now() else null end,
    verified_by=case when p_registration_status='CURRENT' and p_ctp_expiry is not null and p_ctp_expiry>=current_date then auth.uid() else null end,
    updated_at=now()
  where id=v.id;
  update public.driver_verifications set
    registration_status=case when p_registration_status='CURRENT' then 'VERIFIED' when p_registration_status='EXPIRED' then 'EXPIRED' else 'REJECTED' end,
    verification_method=p_verification_method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),
    verification_reference=nullif(trim(coalesce(p_reference,'')),''),
    registration_verified_at=case when p_registration_status='CURRENT' then now() else registration_verified_at end,
    registration_verified_by=case when p_registration_status='CURRENT' then auth.uid() else registration_verified_by end,
    updated_at=now()
  where application_id=a.id;
  update public.driver_compliance_checks set
    status=case when p_registration_status='CURRENT' then 'VERIFIED' when p_registration_status='EXPIRED' then 'EXPIRED' else 'REJECTED' end,
    verification_method=method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),
    verification_reference=nullif(trim(coalesce(p_reference,'')),''),
    reviewer_id=auth.uid(),reviewed_at=now(),expires_at=p_registration_expiry,reason=null,updated_at=now()
  where application_id=a.id and requirement_code='REGISTRATION';
  update public.driver_compliance_checks set
    status=case when p_ctp_expiry is not null and p_ctp_expiry>=current_date then 'VERIFIED' when p_ctp_expiry<current_date then 'EXPIRED' else 'PENDING' end,
    verification_method=method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),
    verification_reference=nullif(trim(coalesce(p_reference,'')),''),
    reviewer_id=auth.uid(),reviewed_at=case when p_ctp_expiry is not null and p_ctp_expiry>=current_date then now() else reviewed_at end,
    expires_at=p_ctp_expiry,reason=case when p_ctp_expiry is null then 'CTP expiry not recorded; MANUAL_REVIEW_REQUIRED' else null end,updated_at=now()
  where application_id=a.id and requirement_code='CTP';
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata)
  values(a.id,auth.uid(),'VEHICLE_REGISTRATION_VERIFICATION',a.status,jsonb_build_object(
    'registration_status',p_registration_status,'registration_expiry',p_registration_expiry,
    'registration_restrictions',p_registration_restrictions,'ctp_provider',p_ctp_provider,
    'ctp_expiry',p_ctp_expiry,'method',p_verification_method,'provider',p_provider,'reference',p_reference
  ));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_vehicle_verification(uuid,text,date,text,text,date,text,text,text) from public,anon;
grant execute on function public.admin_set_driver_vehicle_verification(uuid,text,date,text,text,date,text,text,text) to authenticated;

drop function if exists public.admin_set_driver_credential_details(uuid,text,date,text,text,text,date,text,text,text);
create or replace function public.admin_set_driver_credential_details(
  p_application_id uuid,p_licence_status text,p_licence_expiry date,
  p_insurance_status text,p_insurance_provider text,p_insurance_policy_reference text,
  p_insurance_type text,p_insurance_expiry date,
  p_verification_method text default 'MANUAL_ADMIN_CHECK',p_provider text default null,p_reference text default null
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; method text;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_licence_status not in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid licence status'; end if;
  if p_insurance_status not in ('NOT_REQUIRED','PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid insurance status'; end if;
  if p_verification_method not in ('MANUAL_ADMIN_CHECK','OFFICIAL_API') then raise exception 'Invalid verification method'; end if;
  if p_insurance_type is not null and p_insurance_type not in ('CTP','ADDITIONAL_MOTOR','COMMERCIAL_BUSINESS_USE','OTHER') then raise exception 'Invalid insurance type'; end if;
  if p_licence_status='VERIFIED' and (p_licence_expiry is null or p_licence_expiry<current_date) then raise exception 'A verified licence must have a current expiry date'; end if;
  if p_insurance_status='VERIFIED' and (p_insurance_expiry is null or p_insurance_expiry<current_date) then raise exception 'Verified insurance must have a current expiry date'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  insert into public.driver_verifications(application_id) values(a.id) on conflict do nothing;
  update public.driver_verifications set
    licence_status=p_licence_status,licence_expiry=p_licence_expiry,
    insurance_status=p_insurance_status,insurance_provider=nullif(trim(coalesce(p_insurance_provider,'')),''),
    insurance_policy_reference=nullif(trim(coalesce(p_insurance_policy_reference,'')),''),
    insurance_type=nullif(trim(coalesce(p_insurance_type,'')),''),
    insurance_expiry=p_insurance_expiry,updated_at=now()
  where application_id=a.id;
  method:=case when p_verification_method='OFFICIAL_API' then 'OFFICIAL_API' else 'MANUAL_REVIEW_REQUIRED' end;
  update public.driver_compliance_checks set
    status=p_licence_status,verification_method=method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),
    verification_reference=nullif(trim(coalesce(p_reference,'')),''),
    reviewer_id=auth.uid(),reviewed_at=case when p_licence_status in ('VERIFIED','REJECTED','MORE_INFORMATION_REQUIRED','EXPIRED') then now() else reviewed_at end,
    expires_at=p_licence_expiry,reason=null,updated_at=now()
  where application_id=a.id and requirement_code='LICENCE';
  update public.driver_compliance_checks set
    status=case when p_insurance_status='NOT_REQUIRED' then 'NOT_APPLICABLE' else p_insurance_status end,
    verification_method=method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),
    verification_reference=nullif(trim(coalesce(p_reference,'')),''),
    reviewer_id=auth.uid(),reviewed_at=now(),expires_at=p_insurance_expiry,reason=null,updated_at=now()
  where application_id=a.id and requirement_code='ADDITIONAL_INSURANCE';
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata)
  values(a.id,auth.uid(),'CREDENTIAL_VERIFICATION_UPDATED',a.status,jsonb_build_object(
    'licence_status',p_licence_status,'licence_expiry',p_licence_expiry,
    'insurance_status',p_insurance_status,'insurance_provider',p_insurance_provider,
    'insurance_policy_reference',p_insurance_policy_reference,'insurance_type',p_insurance_type,
    'insurance_expiry',p_insurance_expiry,'method',p_verification_method,'provider',p_provider,'reference',p_reference
  ));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,text,date,text,text,text) to authenticated;
