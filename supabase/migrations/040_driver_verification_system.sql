-- Production driver verification: extend the existing driver system; no duplicate driver identity/role system.
alter table public.driver_applications
  add column if not exists legal_first_name text,
  add column if not exists legal_last_name text,
  add column if not exists date_of_birth date,
  add column if not exists address_line text,
  add column if not exists postcode text,
  add column if not exists country text not null default 'Australia',
  add column if not exists profile_photo_path text,
  add column if not exists last_submitted_at timestamptz,
  add column if not exists status_reason text;

update public.driver_applications set status='SUBMITTED' where status='PENDING';
update public.driver_applications set status='APPROVED' where status='ACTIVE';
alter table public.driver_applications drop constraint if exists driver_applications_status_check;
alter table public.driver_applications add constraint driver_applications_status_check
  check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED','SUSPENDED','EXPIRED'));

create table if not exists public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.driver_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  registration_plate text not null,
  registration_state text not null,
  make text not null,
  model text not null,
  year integer,
  colour text,
  vehicle_type text not null,
  vin text,
  ownership_status text not null check (ownership_status in ('OWNER','AUTHORISED_USER','EMPLOYER_VEHICLE')),
  registration_expiry date,
  registration_status text not null default 'PENDING' check (registration_status in ('PENDING','CURRENT','EXPIRED','SUSPENDED','CANCELLED','REJECTED')),
  ctp_provider text,
  ctp_expiry date,
  verification_method text not null default 'MANUAL_ADMIN_CHECK' check (verification_method in ('MANUAL_ADMIN_CHECK','OFFICIAL_API')),
  verification_provider text,
  verification_reference text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','REJECTED','SUSPENDED','EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.driver_vehicles enable row level security;
drop policy if exists driver_vehicles_owner_read on public.driver_vehicles;
create policy driver_vehicles_owner_read on public.driver_vehicles for select to authenticated using (user_id=auth.uid() or public.is_admin());
revoke all on public.driver_vehicles from anon;
revoke insert,update,delete on public.driver_vehicles from authenticated;
grant select on public.driver_vehicles to authenticated;

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.driver_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.driver_vehicles(id) on delete cascade,
  document_type text not null check (document_type in ('PROFILE_PHOTO','LICENCE_FRONT','LICENCE_BACK','REGISTRATION','VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION','VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE','VEHICLE_INTERIOR','VEHICLE_PLATE','INSURANCE')),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes>0 and size_bytes<=10485760),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','UNDER_REVIEW','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','REPLACED')),
  uploaded_at timestamptz not null default now(),
  expires_at date,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  rejection_reason text,
  created_at timestamptz not null default now()
);
alter table public.driver_documents enable row level security;
drop policy if exists driver_documents_owner_read on public.driver_documents;
create policy driver_documents_owner_read on public.driver_documents for select to authenticated using (user_id=auth.uid() or public.is_admin());
revoke all on public.driver_documents from anon;
revoke insert,update,delete on public.driver_documents from authenticated;
grant select on public.driver_documents to authenticated;

create table if not exists public.driver_verifications (
  application_id uuid primary key references public.driver_applications(id) on delete cascade,
  identity_status text not null default 'PENDING' check (identity_status in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED')),
  licence_status text not null default 'PENDING' check (licence_status in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED')),
  registration_status text not null default 'PENDING' check (registration_status in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED')),
  insurance_status text not null default 'NOT_REQUIRED' check (insurance_status in ('NOT_REQUIRED','PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED')),
  verification_method text not null default 'MANUAL_ADMIN_CHECK' check (verification_method in ('MANUAL_ADMIN_CHECK','OFFICIAL_API')),
  verification_provider text,
  verification_reference text,
  identity_verified_at timestamptz,
  identity_verified_by uuid references auth.users(id),
  licence_verified_at timestamptz,
  licence_verified_by uuid references auth.users(id),
  registration_verified_at timestamptz,
  registration_verified_by uuid references auth.users(id),
  insurance_verified_at timestamptz,
  insurance_verified_by uuid references auth.users(id),
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.driver_verifications enable row level security;
drop policy if exists driver_verifications_owner_read on public.driver_verifications;
create policy driver_verifications_owner_read on public.driver_verifications for select to authenticated using (exists(select 1 from public.driver_applications a where a.id=application_id and (a.user_id=auth.uid() or public.is_admin())));
revoke all on public.driver_verifications from anon;
revoke insert,update,delete on public.driver_verifications from authenticated;
grant select on public.driver_verifications to authenticated;

create table if not exists public.driver_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.driver_applications(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.driver_status_history enable row level security;
drop policy if exists driver_status_history_owner_read on public.driver_status_history;
create policy driver_status_history_owner_read on public.driver_status_history for select to authenticated using (exists(select 1 from public.driver_applications a where a.id=application_id and (a.user_id=auth.uid() or public.is_admin())));
revoke all on public.driver_status_history from anon;
revoke insert,update,delete on public.driver_status_history from authenticated;
grant select on public.driver_status_history to authenticated;

create table if not exists public.driver_verification_requirements (
  id boolean primary key default true check(id),
  require_identity_review boolean not null default true,
  require_licence_review boolean not null default true,
  require_registration_review boolean not null default true,
  require_vehicle_ownership_evidence boolean not null default true,
  require_vehicle_photos boolean not null default true,
  require_additional_insurance boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.driver_verification_requirements(id) values(true) on conflict(id) do nothing;
alter table public.driver_verification_requirements enable row level security;
drop policy if exists driver_requirements_read on public.driver_verification_requirements;
create policy driver_requirements_read on public.driver_verification_requirements for select to authenticated using(true);
revoke all on public.driver_verification_requirements from anon;
revoke insert,update,delete on public.driver_verification_requirements from authenticated;
grant select on public.driver_verification_requirements to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('driver-verification','driver-verification',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists driver_verification_owner_upload on storage.objects;
create policy driver_verification_owner_upload on storage.objects for insert to authenticated
with check(bucket_id='driver-verification' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists driver_verification_owner_read on storage.objects;
create policy driver_verification_owner_read on storage.objects for select to authenticated
using(bucket_id='driver-verification' and (owner_id=(select auth.uid()::text) or public.is_admin()));
drop policy if exists driver_verification_owner_update on storage.objects;
create policy driver_verification_owner_update on storage.objects for update to authenticated
using(bucket_id='driver-verification' and owner_id=(select auth.uid()::text))
with check(bucket_id='driver-verification' and owner_id=(select auth.uid()::text) and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists driver_verification_owner_delete on storage.objects;
create policy driver_verification_owner_delete on storage.objects for delete to authenticated
using(bucket_id='driver-verification' and owner_id=(select auth.uid()::text));

revoke all on public.driver_applications from anon;
revoke insert,update,delete on public.driver_applications from authenticated;
grant select on public.driver_applications to authenticated;

create or replace function public.driver_is_operational(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
select exists(
  select 1 from public.driver_applications a
  join public.driver_verifications v on v.application_id=a.id
  join public.driver_vehicles dv on dv.application_id=a.id
  where a.user_id=p_user_id and a.status='APPROVED'
    and (not (select require_identity_review from public.driver_verification_requirements where id=true) or (v.identity_status='VERIFIED' and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status='VERIFIED')))
    and v.licence_status='VERIFIED'
    and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status='VERIFIED' and d.expires_at is not null and d.expires_at>=current_date)
    and v.registration_status='VERIFIED' and dv.status='VERIFIED' and dv.registration_status='CURRENT'
    and dv.registration_expiry is not null and dv.registration_expiry>=current_date
    and (dv.ctp_expiry is null or dv.ctp_expiry>=current_date)
    and (not (select require_additional_insurance from public.driver_verification_requirements where id=true) or (v.insurance_status='VERIFIED' and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='INSURANCE' and d.status='VERIFIED' and d.expires_at is not null and d.expires_at>=current_date))
    and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.status='MORE_INFORMATION_REQUIRED')
);$$;
revoke execute on function public.driver_is_operational(uuid) from public,anon;
grant execute on function public.driver_is_operational(uuid) to authenticated;

create or replace function public.save_driver_application(
  p_legal_first_name text,p_legal_last_name text,p_date_of_birth date,p_phone text,
  p_address_line text,p_suburb text,p_city text,p_state text,p_postcode text,
  p_service_area text,p_availability text,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare aid uuid; current_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and role='ADMIN') then raise exception 'Administrators cannot apply as delivery drivers'; end if;
  if length(trim(coalesce(p_legal_first_name,'')))<2 or length(trim(coalesce(p_legal_first_name,'')))>80 or length(trim(coalesce(p_legal_last_name,'')))<2 or length(trim(coalesce(p_legal_last_name,'')))>80 then raise exception 'Enter valid legal names'; end if;
  if p_date_of_birth is null or p_date_of_birth>current_date then raise exception 'Enter a valid date of birth'; end if;
  if length(trim(coalesce(p_phone,'')))<6 or length(trim(p_phone))>40 then raise exception 'Enter a valid phone number'; end if;
  select id,status into aid,current_status from public.driver_applications where user_id=auth.uid() for update;
  if current_status in ('APPROVED','SUSPENDED') then raise exception 'This application is not editable in its current state'; end if;
  if aid is null then
    insert into public.driver_applications(user_id,service_area,availability,notes,legal_first_name,legal_last_name,date_of_birth,address_line,suburb,city,state,postcode,status)
    values(auth.uid(),coalesce(nullif(trim(p_service_area),''),'Pending'),coalesce(nullif(trim(p_availability),''),'Pending'),nullif(trim(coalesce(p_notes,'')),''),trim(p_legal_first_name),trim(p_legal_last_name),p_date_of_birth,nullif(trim(p_address_line),''),nullif(trim(p_suburb),''),nullif(trim(p_city),''),nullif(trim(p_state),''),nullif(trim(p_postcode),''),'DRAFT') returning id into aid;
  else
    update public.driver_applications set legal_first_name=trim(p_legal_first_name),legal_last_name=trim(p_legal_last_name),date_of_birth=p_date_of_birth,address_line=nullif(trim(p_address_line),''),suburb=nullif(trim(p_suburb),''),city=nullif(trim(p_city),''),state=nullif(trim(p_state),''),postcode=nullif(trim(p_postcode),''),service_area=coalesce(nullif(trim(p_service_area),''),service_area),availability=coalesce(nullif(trim(p_availability),''),availability),notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=aid;
  end if;
  perform public.update_my_profile(trim(p_legal_first_name||' '||p_legal_last_name),trim(p_phone),nullif(trim(p_suburb),''),nullif(trim(p_city),''),nullif(trim(p_state),''));
  insert into public.driver_verifications(application_id) values(aid) on conflict(application_id) do nothing;
  return aid;
end;$$;
revoke execute on function public.save_driver_application(text,text,date,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.save_driver_application(text,text,date,text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.submit_driver_application() returns boolean
language plpgsql security definer set search_path=public as $$
declare a public.driver_applications; req public.driver_verification_requirements; vcount integer; has_vehicle boolean;
begin
  select * into a from public.driver_applications where user_id=auth.uid() for update;
  if a.id is null then raise exception 'Complete your driver application first'; end if;
  select * into req from public.driver_verification_requirements where id=true;
  select count(*) into vcount from public.driver_documents where application_id=a.id and document_type='LICENCE_FRONT' and status in ('SUBMITTED','UNDER_REVIEW','VERIFIED');
  select exists(select 1 from public.driver_vehicles where application_id=a.id) into has_vehicle;
  if length(coalesce(a.address_line,''))<3 or length(coalesce(a.suburb,''))<2 or length(coalesce(a.city,''))<2 or length(coalesce(a.state,''))<2 then raise exception 'Complete your residential address'; end if;
  if vcount=0 then raise exception 'Upload the front of your driver licence'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='REGISTRATION' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload registration evidence'; end if;
  if not has_vehicle then raise exception 'Add a vehicle before submitting'; end if;
  if req.require_identity_review and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Add a profile photo for identity review'; end if;
  if req.require_vehicle_ownership_evidence and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload vehicle ownership or authorisation evidence'; end if;
  if req.require_vehicle_photos and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE') and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload required vehicle photos'; end if;
  if req.require_additional_insurance and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='INSURANCE' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload required insurance evidence'; end if;
  update public.driver_applications set status='SUBMITTED',last_submitted_at=now(),submitted_at=now(),status_reason=null,updated_at=now() where id=a.id;
  insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status) values(a.id,auth.uid(),'APPLICATION_SUBMITTED',a.status,'SUBMITTED');
  insert into public.notifications(user_id,kind,title,body,data) values(auth.uid(),'DRIVER_APPLICATION_SUBMITTED','Driver application submitted','Your Everest driver application is now waiting for review.',jsonb_build_object('application_id',a.id));
  return true;
end;$$;
revoke execute on function public.submit_driver_application() from public,anon;
grant execute on function public.submit_driver_application() to authenticated;

create or replace function public.save_driver_vehicle(
  p_registration_plate text,p_registration_state text,p_make text,p_model text,p_year integer,
  p_colour text,p_vehicle_type text,p_vin text,p_ownership_status text,p_registration_expiry date
) returns uuid language plpgsql security definer set search_path=public as $$
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
  insert into public.driver_vehicles(application_id,user_id,registration_plate,registration_state,make,model,year,colour,vehicle_type,vin,ownership_status,registration_expiry)
  values(aid,auth.uid(),upper(trim(p_registration_plate)),upper(trim(p_registration_state)),trim(p_make),trim(p_model),p_year,nullif(trim(p_colour),''),trim(p_vehicle_type),nullif(trim(p_vin),''),p_ownership_status,p_registration_expiry)
  on conflict(application_id) do update set registration_plate=excluded.registration_plate,registration_state=excluded.registration_state,make=excluded.make,model=excluded.model,year=excluded.year,colour=excluded.colour,vehicle_type=excluded.vehicle_type,vin=excluded.vin,ownership_status=excluded.ownership_status,registration_expiry=excluded.registration_expiry,status='PENDING',registration_status='PENDING',verification_method='MANUAL_ADMIN_CHECK',verification_provider=null,verification_reference=null,verified_at=null,verified_by=null,updated_at=now()
  returning id into vid;
  return vid;
end;$$;
revoke execute on function public.save_driver_vehicle(text,text,text,text,integer,text,text,text,text,date) from public,anon;
grant execute on function public.save_driver_vehicle(text,text,text,text,integer,text,text,text,text,date) to authenticated;

create or replace function public.register_driver_document(
  p_application_id uuid,p_vehicle_id uuid,p_document_type text,p_storage_path text,p_mime_type text,p_size_bytes bigint,p_expires_at date default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare did uuid;
begin
  if not exists(select 1 from public.driver_applications where id=p_application_id and user_id=auth.uid()) then raise exception 'Application not found'; end if;
  if split_part(p_storage_path,'/',1)<>auth.uid()::text then raise exception 'Invalid private document path'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes<=0 or p_size_bytes>10485760 then raise exception 'Invalid document'; end if;
  if p_document_type not in ('PROFILE_PHOTO','LICENCE_FRONT','LICENCE_BACK','REGISTRATION','VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION','VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE','VEHICLE_INTERIOR','VEHICLE_PLATE','INSURANCE') then raise exception 'Unsupported document type'; end if;
  if p_vehicle_id is not null and not exists(select 1 from public.driver_vehicles where id=p_vehicle_id and application_id=p_application_id and user_id=auth.uid()) then raise exception 'Vehicle does not belong to this application'; end if;
  update public.driver_documents set status='REPLACED' where application_id=p_application_id and document_type=p_document_type and status<>'REPLACED';
  insert into public.driver_documents(application_id,user_id,vehicle_id,document_type,storage_path,mime_type,size_bytes,expires_at)
  values(p_application_id,auth.uid(),p_vehicle_id,p_document_type,p_storage_path,p_mime_type,p_size_bytes,p_expires_at) returning id into did;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata) values(p_application_id,auth.uid(),'DOCUMENT_UPLOADED',(select status from public.driver_applications where id=p_application_id),jsonb_build_object('document_type',p_document_type));
  return did;
end;$$;
revoke execute on function public.register_driver_document(uuid,uuid,text,text,text,bigint,date) from public,anon;
grant execute on function public.register_driver_document(uuid,uuid,text,text,text,bigint,date) to authenticated;

create or replace function public.admin_set_driver_application(p_application_id uuid,p_status text,p_notes text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.driver_applications; v public.driver_verifications; dv public.driver_vehicles; req public.driver_verification_requirements; prev text; reason text;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  reason:=nullif(trim(coalesce(p_notes,'')),'');
  if p_status not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED','SUSPENDED') then raise exception 'Invalid driver application status'; end if;
  if p_status in ('MORE_INFORMATION_REQUIRED','REJECTED','SUSPENDED') and reason is null then raise exception 'A reason is required for this action'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  prev:=a.status;
  if p_status='APPROVED' then
    select * into v from public.driver_verifications where application_id=a.id;
    select * into dv from public.driver_vehicles where application_id=a.id;
    select * into req from public.driver_verification_requirements where id=true;
    if req.require_identity_review and (v.identity_status<>'VERIFIED' or not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status='VERIFIED')) then raise exception 'Identity checklist is incomplete'; end if;
    if v.licence_status<>'VERIFIED' or not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status='VERIFIED' and d.expires_at is not null and d.expires_at>=current_date) then raise exception 'Licence checklist is incomplete'; end if;
    if v.registration_status<>'VERIFIED' or dv.status<>'VERIFIED' or dv.registration_status<>'CURRENT' or dv.registration_expiry is null or dv.registration_expiry<current_date then raise exception 'Vehicle registration checklist is incomplete'; end if;
    if req.require_vehicle_ownership_evidence and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') and d.status='VERIFIED') then raise exception 'Vehicle ownership/authorisation evidence is incomplete'; end if;
    if req.require_vehicle_photos and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE') and d.status='VERIFIED') then raise exception 'Required vehicle photos are incomplete'; end if;
    if req.require_additional_insurance and (v.insurance_status<>'VERIFIED' or not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='INSURANCE' and d.status='VERIFIED' and d.expires_at is not null and d.expires_at>=current_date)) then raise exception 'Required insurance is incomplete'; end if;
  end if;
  update public.driver_applications set status=p_status,status_reason=case when p_status in ('MORE_INFORMATION_REQUIRED','REJECTED','SUSPENDED') then reason else null end,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=a.id;
  if p_status='APPROVED' then
    insert into public.driver_verifications(application_id) values(a.id) on conflict do nothing;
  end if;
  insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status,reason) values(a.id,auth.uid(),'ADMIN_STATUS_CHANGE',prev,p_status,reason);
  insert into public.admin_actions(admin_id,action,target_type,target_id,metadata) values(auth.uid(),'driver_application_status','driver_application',a.id,jsonb_build_object('previous_status',prev,'status',p_status,'reason',reason));
  insert into public.notifications(user_id,kind,title,body,data)
  values(a.user_id,'DRIVER_APPLICATION_STATUS',
    case when p_status='APPROVED' then 'Driver application approved' when p_status='MORE_INFORMATION_REQUIRED' then 'Action required for your driver application' when p_status='REJECTED' then 'Driver application update' when p_status='SUSPENDED' then 'Driver account suspended' else 'Driver application under review' end,
    case when p_status='APPROVED' then 'Your verification is complete. Driver access is now available when your credentials remain valid.' when p_status='MORE_INFORMATION_REQUIRED' then 'Everest needs more information before your application can be approved.' else coalesce(reason,'Your driver application status has been updated.') end,
    jsonb_build_object('application_id',a.id,'status',p_status));
  return true;
end;$$;
revoke execute on function public.admin_set_driver_application(uuid,text,text) from public,anon;
grant execute on function public.admin_set_driver_application(uuid,text,text) to authenticated;

create or replace function public.admin_set_driver_verification(
  p_application_id uuid,p_identity_status text default null,p_licence_status text default null,
  p_registration_status text default null,p_insurance_status text default null,
  p_verification_method text default 'MANUAL_ADMIN_CHECK',p_provider text default null,p_reference text default null,p_notes text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare a public.driver_applications; dv public.driver_vehicles;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  insert into public.driver_verifications(application_id) values(a.id) on conflict do nothing;
  if p_verification_method not in ('MANUAL_ADMIN_CHECK','OFFICIAL_API') then raise exception 'Invalid verification method'; end if;
  if p_identity_status is not null and p_identity_status not in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED') then raise exception 'Invalid identity status'; end if;
  if p_licence_status is not null and p_licence_status not in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid licence status'; end if;
  if p_registration_status is not null and p_registration_status not in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid registration status'; end if;
  if p_insurance_status is not null and p_insurance_status not in ('NOT_REQUIRED','PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid insurance status'; end if;
  update public.driver_verifications set identity_status=coalesce(p_identity_status,identity_status),licence_status=coalesce(p_licence_status,licence_status),registration_status=coalesce(p_registration_status,registration_status),insurance_status=coalesce(p_insurance_status,insurance_status),verification_method=p_verification_method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),verification_reference=nullif(trim(coalesce(p_reference,'')),''),notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes),identity_verified_at=case when p_identity_status='VERIFIED' then now() else identity_verified_at end,identity_verified_by=case when p_identity_status='VERIFIED' then auth.uid() else identity_verified_by end,licence_verified_at=case when p_licence_status='VERIFIED' then now() else licence_verified_at end,licence_verified_by=case when p_licence_status='VERIFIED' then auth.uid() else licence_verified_by end,registration_verified_at=case when p_registration_status='VERIFIED' then now() else registration_verified_at end,registration_verified_by=case when p_registration_status='VERIFIED' then auth.uid() else registration_verified_by end,insurance_verified_at=case when p_insurance_status='VERIFIED' then now() else insurance_verified_at end,insurance_verified_by=case when p_insurance_status='VERIFIED' then auth.uid() else insurance_verified_by end,updated_at=now() where application_id=a.id;
  if p_registration_status='VERIFIED' then
    select * into dv from public.driver_vehicles where application_id=a.id for update;
    if dv.id is not null then update public.driver_vehicles set status='VERIFIED',registration_status='CURRENT',verification_method=p_verification_method,verification_provider=nullif(trim(coalesce(p_provider,'')),''),verification_reference=nullif(trim(coalesce(p_reference,'')),''),verified_at=now(),verified_by=auth.uid(),updated_at=now() where id=dv.id; end if;
  elsif p_registration_status in ('REJECTED','EXPIRED') then
    update public.driver_vehicles set status=case when p_registration_status='EXPIRED' then 'EXPIRED' else 'REJECTED' end,registration_status=case when p_registration_status='EXPIRED' then 'EXPIRED' else 'REJECTED' end,updated_at=now() where application_id=a.id;
  end if;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata) values(a.id,auth.uid(),'VERIFICATION_UPDATED',a.status,jsonb_build_object('method',p_verification_method,'identity',p_identity_status,'licence',p_licence_status,'registration',p_registration_status,'insurance',p_insurance_status));
  return true;
end;$$;
revoke execute on function public.admin_set_driver_verification(uuid,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.admin_set_driver_verification(uuid,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.admin_set_driver_document_status(p_document_id uuid,p_status text,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare d public.driver_documents;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_status not in ('UNDER_REVIEW','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED') then raise exception 'Invalid document status'; end if;
  if p_status in ('MORE_INFORMATION_REQUIRED','REJECTED') and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A reason is required'; end if;
  select * into d from public.driver_documents where id=p_document_id for update;
  if d.id is null then raise exception 'Document not found'; end if;
  update public.driver_documents set status=p_status,rejection_reason=case when p_status in ('MORE_INFORMATION_REQUIRED','REJECTED') then nullif(trim(p_reason),'') else null end,verified_at=case when p_status='VERIFIED' then now() else verified_at end,verified_by=case when p_status='VERIFIED' then auth.uid() else verified_by end where id=d.id;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,reason,metadata) values(d.application_id,auth.uid(),'DOCUMENT_STATUS_CHANGE',(select status from public.driver_applications where id=d.application_id),p_reason,jsonb_build_object('document_id',d.id,'document_type',d.document_type,'status',p_status));
  return true;
end;$$;
revoke execute on function public.admin_set_driver_document_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_driver_document_status(uuid,text,text) to authenticated;

create or replace function public.refresh_driver_verification_status(p_user_id uuid default auth.uid())
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.driver_applications; dv public.driver_vehicles; req public.driver_verification_requirements; expired boolean:=false; days integer;
begin
  if p_user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  select * into a from public.driver_applications where user_id=p_user_id for update;
  if a.id is null then return false; end if;
  select * into dv from public.driver_vehicles where application_id=a.id;
  select * into req from public.driver_verification_requirements where id=true;
  expired:=coalesce(dv.registration_expiry<current_date,false) or coalesce(dv.ctp_expiry<current_date,false)
    or exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status='VERIFIED' and d.expires_at<current_date)
    or (req.require_additional_insurance and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='INSURANCE' and d.status='VERIFIED' and d.expires_at<current_date));
  if expired and a.status='APPROVED' then
    update public.driver_applications set status='EXPIRED',status_reason='A required credential has expired.',updated_at=now() where id=a.id;
    insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status,reason) values(a.id,auth.uid(),'CREDENTIAL_EXPIRED','APPROVED','EXPIRED','A required driver credential expired.');
    insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_CREDENTIAL_EXPIRED','Driver access restricted','A required driver credential has expired. Update it before accepting new delivery work.',jsonb_build_object('application_id',a.id));
  end if;
  if dv.id is not null then
    days:=dv.registration_expiry-current_date;
    if days in (30,14,7) then insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_REGISTRATION_EXPIRY','Vehicle registration expires soon','Your vehicle registration expires in '||days||' days.',jsonb_build_object('application_id',a.id,'days',days)); end if;
  end if;
  return not expired;
end;$$;
revoke execute on function public.refresh_driver_verification_status(uuid) from public,anon;
grant execute on function public.refresh_driver_verification_status(uuid) to authenticated;

create or replace function public.get_my_access_context() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); profile_role public.app_role; business_id uuid; business_name text; business_status public.business_status; business_verification public.verification_status; driver_status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform public.refresh_driver_verification_status(uid);
  select role into profile_role from public.profiles where id=uid;
  select b.id,b.name,b.status,b.verification_status into business_id,business_name,business_status,business_verification from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.user_id=uid and bm.member_role='OWNER' order by b.created_at desc limit 1;
  select status into driver_status from public.driver_applications where user_id=uid;
  return jsonb_build_object('profile_role',profile_role,'business_id',business_id,'business_name',business_name,'business_status',business_status,'business_verification_status',business_verification,'driver_application_status',driver_status,'is_business_member',exists(select 1 from public.business_members where user_id=uid),'is_verified_business',coalesce(business_verification='VERIFIED',false),'is_active_driver',public.driver_is_operational(uid),'is_admin',coalesce(profile_role='ADMIN',false));
end;$$;
revoke execute on function public.get_my_access_context() from public,anon;
grant execute on function public.get_my_access_context() to authenticated;

create or replace function public.assign_delivery_driver(p_delivery_id uuid,p_driver_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare d public.deliveries;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  perform public.refresh_driver_verification_status(p_driver_id);
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if d.status<>'READY_FOR_PICKUP' then raise exception 'Delivery must be ready for pickup before assignment'; end if;
  if not public.driver_is_operational(p_driver_id) then raise exception 'Selected user is not an active verified delivery driver'; end if;
  insert into public.delivery_assignments(delivery_id,driver_id,assigned_at) values(d.id,p_driver_id,now()) on conflict(delivery_id) do update set driver_id=excluded.driver_id,assigned_at=now(),accepted_at=null,completed_at=null;
  update public.deliveries set status='ASSIGNED',updated_at=now() where id=d.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ASSIGN_DELIVERY_DRIVER','DELIVERY',d.id,jsonb_build_object('driver_id',p_driver_id));
  insert into public.notifications(user_id,kind,title,body,data) values(p_driver_id,'DELIVERY_ASSIGNED','New delivery assigned','A new Everest delivery has been assigned to you.',jsonb_build_object('delivery_id',d.id,'order_id',d.order_id));
  return true;
end;$$;
revoke execute on function public.assign_delivery_driver(uuid,uuid) from public,anon;
grant execute on function public.assign_delivery_driver(uuid,uuid) to authenticated;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status public.delivery_status) returns boolean
language plpgsql security definer set search_path=public as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if not public.is_admin() then
    perform public.refresh_driver_verification_status(auth.uid());
    if not public.driver_is_operational(auth.uid()) then raise exception 'Verified driver access is required'; end if;
    if not exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid()) then raise exception 'This delivery is not assigned to you'; end if;
  end if;
  if (d.status,p_status) not in (('PENDING','ACCEPTED'),('PENDING','CANCELLED'),('ACCEPTED','PREPARING'),('ACCEPTED','CANCELLED'),('PREPARING','READY_FOR_PICKUP'),('PREPARING','CANCELLED'),('ASSIGNED','PICKED_UP'),('ASSIGNED','CANCELLED'),('PICKED_UP','OUT_FOR_DELIVERY'),('OUT_FOR_DELIVERY','DELIVERED'),('OUT_FOR_DELIVERY','FAILED')) then raise exception 'Invalid delivery transition'; end if;
  update public.deliveries set status=p_status,updated_at=now() where id=d.id;
  if p_status='PICKED_UP' then update public.delivery_assignments set accepted_at=coalesce(accepted_at,now()) where delivery_id=d.id; update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status='READY_FOR_PICKUP';
  elsif p_status='OUT_FOR_DELIVERY' then update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status in ('READY_FOR_PICKUP','OUT_FOR_DELIVERY');
  elsif p_status='DELIVERED' then update public.delivery_assignments set completed_at=now() where delivery_id=d.id; update public.orders set status='DELIVERED',updated_at=now() where id=d.order_id and status='OUT_FOR_DELIVERY';
  elsif p_status='FAILED' then update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED');
  elsif p_status='CANCELLED' then update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED'); end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'UPDATE_DELIVERY_STATUS','DELIVERY',d.id,jsonb_build_object('from',d.status,'to',p_status));
  return true;
end;$$;
revoke execute on function public.update_delivery_status(uuid,public.delivery_status) from public,anon;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;

create index if not exists driver_applications_status_idx on public.driver_applications(status,submitted_at);
create index if not exists driver_documents_application_idx on public.driver_documents(application_id,status);
create index if not exists driver_documents_user_idx on public.driver_documents(user_id,document_type);
create index if not exists driver_vehicles_application_idx on public.driver_vehicles(application_id,status);
create index if not exists driver_status_history_application_idx on public.driver_status_history(application_id,created_at desc);
