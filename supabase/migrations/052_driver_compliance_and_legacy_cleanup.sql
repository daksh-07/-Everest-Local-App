-- Driver compliance normalization and legacy vehicle-field cleanup.
-- Canonical vehicle source: public.driver_vehicles.
-- The legacy driver application vehicle columns are removed only after the
-- legacy client RPC was revoked and confirmed to have no dependent objects.

drop function if exists public.create_driver_application(
  text,text,text,text,text,text,text,text,text,text
);

alter table public.driver_applications
  drop column if exists vehicle_type,
  drop column if exists vehicle_registration;

alter table public.driver_applications
  add column if not exists compliance_jurisdiction text not null default 'AU-NSW';

alter table public.driver_vehicles
  add column if not exists registration_restrictions text;

alter table public.driver_verifications
  add column if not exists licence_restrictions text,
  add column if not exists insurance_type text;

alter table public.driver_documents
  add column if not exists document_number text,
  add column if not exists issuing_jurisdiction text;

alter table public.driver_documents
  drop constraint if exists driver_documents_document_type_check;
alter table public.driver_documents
  add constraint driver_documents_document_type_check check (
    document_type in (
      'PROFILE_PHOTO','IDENTITY_DOCUMENT',
      'LICENCE_FRONT','LICENCE_BACK',
      'REGISTRATION','VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION',
      'VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE','VEHICLE_INTERIOR','VEHICLE_PLATE',
      'INSURANCE','POLICE_CHECK','WORK_RIGHTS','ABN_EVIDENCE'
    )
  );

create table if not exists public.driver_compliance_requirements (
  jurisdiction_code text not null,
  requirement_code text not null,
  title text not null,
  description text not null,
  required boolean not null default true,
  source_type text not null check (source_type in (
    'LEGAL_REQUIREMENT','OFFICIAL_SOURCE_REQUIREMENT','EVEREST_POLICY_REQUIREMENT','OPTIONAL','NOT_APPLICABLE'
  )),
  source_name text,
  source_url text,
  source_notes text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (jurisdiction_code,requirement_code)
);
alter table public.driver_compliance_requirements enable row level security;
drop policy if exists driver_compliance_requirements_read on public.driver_compliance_requirements;
create policy driver_compliance_requirements_read
on public.driver_compliance_requirements
for select to authenticated
using (true);
revoke insert,update,delete on public.driver_compliance_requirements from anon,authenticated;
grant select on public.driver_compliance_requirements to authenticated;

insert into public.driver_compliance_requirements
(jurisdiction_code,requirement_code,title,description,required,source_type,source_name,source_url,source_notes)
values
('AU-NSW','IDENTITY','Identity review','Legal identity details, profile photograph and at least one identity document must be reviewed by Everest.','true','EVEREST_POLICY_REQUIREMENT','Everest Local driver policy','', 'Everest policy, not a statement of NSW law.'),
('AU-NSW','LICENCE','Driver licence','Licence details and evidence must be reviewed; automated official verification is used only after authorised access is configured.','true','OFFICIAL_SOURCE_REQUIREMENT','Service NSW Driver Licence Check service','https://www.service.nsw.gov.au/transaction/apply-for-the-driver-licence-check-service','The official service requires organisational approval and a Standard Agreement. Until authorised access exists, the result is MANUAL_REVIEW_REQUIRED.'),
('AU-NSW','REGISTRATION','Vehicle registration','Registration status, expiry and restrictions must be checked against authoritative evidence.','true','OFFICIAL_SOURCE_REQUIREMENT','Service NSW vehicle registration check','https://www.service.nsw.gov.au/transaction/check-a-vehicle-registration','Official source describes registration status, expiry, restrictions and CTP information. Everest does not claim an automated check without an authorised integration.'),
('AU-NSW','CTP','Compulsory third party insurance','Current CTP provider and expiry must be recorded and reviewed for the vehicle.','true','OFFICIAL_SOURCE_REQUIREMENT','Service NSW vehicle registration check','https://www.service.nsw.gov.au/transaction/check-a-vehicle-registration','Official registration check includes CTP provider and policy expiry.'),
('AU-NSW','VEHICLE_OWNERSHIP','Vehicle ownership / authorised use','Evidence must support ownership or the driver''s authority to use an employer or third-party vehicle.','true','EVEREST_POLICY_REQUIREMENT','Everest Local driver policy','', 'Everest policy, not a statement that every delivery driver is legally required to hold a specific ownership document.'),
('AU-NSW','VEHICLE_PHOTOS','Vehicle photographs','Clear vehicle photographs are required for Everest safety and identity review.','true','EVEREST_POLICY_REQUIREMENT','Everest Local driver policy','', 'Everest policy.'),
('AU-NSW','ADDITIONAL_INSURANCE','Additional motor vehicle insurance','Where configured by Everest, additional insurance must be evidenced and reviewed; CTP is tracked separately.','false','EVEREST_POLICY_REQUIREMENT','Everest Local driver policy','', 'No claim is made that a particular additional policy is legally mandatory for every delivery arrangement.'),
('AU-NSW','POLICE_CHECK','Police check','Optional compliance item reserved for a future configured requirement or provider workflow.','false','OPTIONAL','NSW Police / Service NSW','https://www.service.nsw.gov.au/transaction/apply-for-a-national-police-check','Not required by the current Everest configuration.'),
('AU-NSW','WORK_RIGHTS','Australian work rights','Optional compliance item for a future authorised VEVO workflow.','false','OPTIONAL','Australian Department of Home Affairs VEVO','https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online','No automated work-right verification is claimed without authorised access.'),
('AU-NSW','ABN','ABN evidence','Optional business/tax identity item for future driver business workflows.','false','OPTIONAL','Australian Business Register','https://www.abr.gov.au/government-agencies/accessing-abr-data/abr-data-products-and-services','Not required by the current Everest driver configuration.')
on conflict (jurisdiction_code,requirement_code) do update set
  title=excluded.title,description=excluded.description,required=excluded.required,
  source_type=excluded.source_type,source_name=excluded.source_name,source_url=excluded.source_url,
  source_notes=excluded.source_notes,active=true,updated_at=now();

create table if not exists public.driver_compliance_checks (
  application_id uuid not null references public.driver_applications(id) on delete cascade,
  jurisdiction_code text not null,
  requirement_code text not null,
  status text not null default 'PENDING' check (status in (
    'PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED','NOT_APPLICABLE'
  )),
  verification_method text not null default 'MANUAL_REVIEW_REQUIRED' check (verification_method in (
    'MANUAL_REVIEW_REQUIRED','OFFICIAL_API','AUTHORISED_PROVIDER'
  )),
  verification_provider text,
  verification_reference text,
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  expires_at date,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (application_id,requirement_code),
  foreign key (jurisdiction_code,requirement_code)
    references public.driver_compliance_requirements(jurisdiction_code,requirement_code)
);
alter table public.driver_compliance_checks enable row level security;
drop policy if exists driver_compliance_checks_owner_read on public.driver_compliance_checks;
create policy driver_compliance_checks_owner_read
on public.driver_compliance_checks
for select to authenticated
using (exists(
  select 1 from public.driver_applications a
  where a.id=application_id and (a.user_id=auth.uid() or public.is_admin())
));
revoke insert,update,delete on public.driver_compliance_checks from anon,authenticated;
grant select on public.driver_compliance_checks to authenticated;

create index if not exists driver_compliance_checks_application_idx
  on public.driver_compliance_checks(application_id,status);

create table if not exists public.driver_declaration_templates (
  declaration_key text primary key,
  version text not null,
  declaration_text text not null,
  required boolean not null default true,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.driver_declaration_templates enable row level security;
drop policy if exists driver_declaration_templates_read on public.driver_declaration_templates;
create policy driver_declaration_templates_read
on public.driver_declaration_templates
for select to authenticated
using (active=true);
revoke insert,update,delete on public.driver_declaration_templates from anon,authenticated;
grant select on public.driver_declaration_templates to authenticated;

insert into public.driver_declaration_templates(declaration_key,version,declaration_text)
values
('INFORMATION_ACCURACY','2026-09-19','I confirm the information I provide in my Everest Local driver application is accurate to the best of my knowledge.'),
('VEHICLE_AUTHORITY','2026-09-19','I confirm I am authorised to use the vehicle identified in my application for the work I undertake through Everest Local.'),
('DOCUMENT_AUTHENTICITY','2026-09-19','I confirm the documents I submit belong to me or relate to the vehicle or policy identified, and I understand Everest may require additional verification.')
on conflict (declaration_key) do update set
  version=excluded.version,declaration_text=excluded.declaration_text,required=true,active=true,updated_at=now();

create table if not exists public.driver_declarations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.driver_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  declaration_key text not null references public.driver_declaration_templates(declaration_key),
  declaration_version text not null,
  declaration_text text not null,
  accepted_at timestamptz not null default now(),
  unique(application_id,declaration_key)
);
alter table public.driver_declarations enable row level security;
drop policy if exists driver_declarations_owner_read on public.driver_declarations;
create policy driver_declarations_owner_read
on public.driver_declarations
for select to authenticated
using (user_id=auth.uid() or public.is_admin());
revoke insert,update,delete on public.driver_declarations from anon,authenticated;
grant select on public.driver_declarations to authenticated;

create index if not exists driver_declarations_application_idx
  on public.driver_declarations(application_id,accepted_at);

create or replace function public.accept_driver_declaration(p_declaration_key text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare aid uuid; t public.driver_declaration_templates;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into aid from public.driver_applications where user_id=auth.uid();
  if aid is null then raise exception 'Start your driver application first'; end if;
  select * into t from public.driver_declaration_templates
    where declaration_key=upper(trim(p_declaration_key)) and active=true and required=true;
  if t.declaration_key is null then raise exception 'Declaration not available'; end if;
  insert into public.driver_declarations(application_id,user_id,declaration_key,declaration_version,declaration_text)
  values(aid,auth.uid(),t.declaration_key,t.version,t.declaration_text)
  on conflict(application_id,declaration_key) do update set
    declaration_version=excluded.declaration_version,
    declaration_text=excluded.declaration_text,
    accepted_at=now();
  insert into public.driver_status_history(application_id,actor_id,action,metadata)
  values(aid,auth.uid(),'DECLARATION_ACCEPTED',jsonb_build_object('declaration_key',t.declaration_key,'version',t.version));
  return true;
end;
$$;
revoke execute on function public.accept_driver_declaration(text) from public,anon;
grant execute on function public.accept_driver_declaration(text) to authenticated;

create or replace function public.save_driver_application(
  p_legal_first_name text,p_legal_last_name text,p_date_of_birth date,p_phone text,
  p_address_line text,p_suburb text,p_city text,p_state text,p_postcode text,
  p_service_area text,p_availability text,p_notes text default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare aid uuid; current_status text; jurisdiction text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and role='ADMIN') then raise exception 'Administrators cannot apply as delivery drivers'; end if;
  if length(trim(coalesce(p_legal_first_name,'')))<2 or length(trim(coalesce(p_legal_first_name,'')))>80
     or length(trim(coalesce(p_legal_last_name,'')))<2 or length(trim(coalesce(p_legal_last_name,'')))>80
  then raise exception 'Enter valid legal names'; end if;
  if p_date_of_birth is null or p_date_of_birth>current_date then raise exception 'Enter a valid date of birth'; end if;
  if length(trim(coalesce(p_phone,'')))<6 or length(trim(p_phone))>40 then raise exception 'Enter a valid phone number'; end if;
  jurisdiction:=case upper(trim(coalesce(p_state,'')))
    when 'NSW' then 'AU-NSW' when 'VIC' then 'AU-VIC' when 'QLD' then 'AU-QLD'
    when 'WA' then 'AU-WA' when 'SA' then 'AU-SA' when 'TAS' then 'AU-TAS'
    when 'ACT' then 'AU-ACT' when 'NT' then 'AU-NT' else 'AU-UNKNOWN' end;
  select id,status into aid,current_status from public.driver_applications where user_id=auth.uid() for update;
  if current_status in ('APPROVED','SUSPENDED') then raise exception 'This application is not editable in its current state'; end if;
  if aid is null then
    insert into public.driver_applications(
      user_id,service_area,availability,notes,legal_first_name,legal_last_name,date_of_birth,
      address_line,suburb,city,state,postcode,status,compliance_jurisdiction
    )
    values(
      auth.uid(),coalesce(nullif(trim(p_service_area),''),'Pending'),
      coalesce(nullif(trim(p_availability),''),'Pending'),
      nullif(trim(coalesce(p_notes,'')),''),trim(p_legal_first_name),trim(p_legal_last_name),
      p_date_of_birth,nullif(trim(p_address_line),''),nullif(trim(p_suburb),''),
      nullif(trim(p_city),''),nullif(trim(p_state),''),nullif(trim(p_postcode),''),'DRAFT',jurisdiction
    ) returning id into aid;
  else
    update public.driver_applications set
      legal_first_name=trim(p_legal_first_name),legal_last_name=trim(p_legal_last_name),
      date_of_birth=p_date_of_birth,address_line=nullif(trim(p_address_line),''),
      suburb=nullif(trim(p_suburb),''),city=nullif(trim(p_city),''),state=nullif(trim(p_state),''),
      postcode=nullif(trim(p_postcode),''),service_area=coalesce(nullif(trim(p_service_area),''),service_area),
      availability=coalesce(nullif(trim(p_availability),''),availability),
      notes=nullif(trim(coalesce(p_notes,'')),''),compliance_jurisdiction=jurisdiction,updated_at=now()
    where id=aid;
  end if;
  perform public.update_my_profile(
    trim(p_legal_first_name||' '||p_legal_last_name),trim(p_phone),
    nullif(trim(p_suburb),''),nullif(trim(p_city),''),nullif(trim(p_state),'')
  );
  insert into public.driver_verifications(application_id) values(aid) on conflict(application_id) do nothing;
  insert into public.driver_compliance_checks(application_id,jurisdiction_code,requirement_code)
  select aid,jurisdiction,r.requirement_code
  from public.driver_compliance_requirements r
  where r.jurisdiction_code=jurisdiction and r.active=true
  on conflict do nothing;
  return aid;
end;
$$;
revoke execute on function public.save_driver_application(text,text,date,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.save_driver_application(text,text,date,text,text,text,text,text,text,text,text,text) to authenticated;

drop function if exists public.register_driver_document(uuid,uuid,text,text,text,bigint,date);
create or replace function public.register_driver_document(
  p_application_id uuid,p_vehicle_id uuid,p_document_type text,p_storage_path text,
  p_mime_type text,p_size_bytes bigint,p_expires_at date default null,
  p_document_number text default null,p_issuing_jurisdiction text default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare did uuid; existing_status text;
begin
  if not exists(select 1 from public.driver_applications where id=p_application_id and user_id=auth.uid()) then raise exception 'Application not found'; end if;
  if split_part(p_storage_path,'/',1)<>auth.uid()::text then raise exception 'Invalid private document path'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes<=0 or p_size_bytes>10485760 then raise exception 'Invalid document'; end if;
  if p_document_type not in (
    'PROFILE_PHOTO','IDENTITY_DOCUMENT','LICENCE_FRONT','LICENCE_BACK','REGISTRATION',
    'VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION','VEHICLE_FRONT','VEHICLE_REAR',
    'VEHICLE_SIDE','VEHICLE_INTERIOR','VEHICLE_PLATE','INSURANCE','POLICE_CHECK',
    'WORK_RIGHTS','ABN_EVIDENCE'
  ) then raise exception 'Unsupported document type'; end if;
  if p_vehicle_id is not null and not exists(
    select 1 from public.driver_vehicles where id=p_vehicle_id and application_id=p_application_id and user_id=auth.uid()
  ) then raise exception 'Vehicle does not belong to this application'; end if;
  select status into existing_status from public.driver_documents
    where application_id=p_application_id and document_type=p_document_type and status<>'REPLACED'
    order by uploaded_at desc limit 1;
  if existing_status='VERIFIED' then
    raise exception 'Verified document cannot be silently replaced. Request admin review instead.';
  end if;
  update public.driver_documents
    set status='REPLACED'
    where application_id=p_application_id and document_type=p_document_type and status<>'REPLACED';
  insert into public.driver_documents(
    application_id,user_id,vehicle_id,document_type,storage_path,mime_type,size_bytes,
    expires_at,document_number,issuing_jurisdiction
  )
  values(
    p_application_id,auth.uid(),p_vehicle_id,p_document_type,p_storage_path,p_mime_type,
    p_size_bytes,p_expires_at,nullif(trim(p_document_number),''),upper(nullif(trim(p_issuing_jurisdiction),''))
  ) returning id into did;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata)
  values(p_application_id,auth.uid(),'DOCUMENT_UPLOADED',
    (select status from public.driver_applications where id=p_application_id),
    jsonb_build_object('document_type',p_document_type,'replaced_previous',existing_status is not null));
  return did;
end;
$$;
revoke execute on function public.register_driver_document(uuid,uuid,text,text,text,bigint,date,text,text) from public,anon;
grant execute on function public.register_driver_document(uuid,uuid,text,text,text,bigint,date,text,text) to authenticated;

create or replace function public.evaluate_driver_compliance(p_application_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  a public.driver_applications; v public.driver_verifications; dv public.driver_vehicles;
  jurisdiction text; blocking jsonb:='[]'::jsonb; expires_soon jsonb:='[]'::jsonb;
  identity_status text:='PENDING'; licence_status text:='PENDING'; vehicle_status text:='PENDING';
  registration_status text:='PENDING'; ctp_status text:='PENDING'; insurance_status text:='NOT_REQUIRED';
  source_identity jsonb:='{}'::jsonb; source_licence jsonb:='{}'::jsonb;
  source_registration jsonb:='{}'::jsonb; source_ctp jsonb:='{}'::jsonb; source_vehicle jsonb:='{}'::jsonb; source_insurance jsonb:='{}'::jsonb;
  req record; doc record; days integer; overall_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into a from public.driver_applications where id=p_application_id;
  if a.id is null then raise exception 'Driver application not found'; end if;
  if a.user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  jurisdiction:=a.compliance_jurisdiction;
  if not exists(select 1 from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and active=true) then
    blocking:=blocking||jsonb_build_array('COMPLIANCE_JURISDICTION_NOT_CONFIGURED');
  end if;
  select * into v from public.driver_verifications where application_id=a.id;
  select * into dv from public.driver_vehicles where application_id=a.id;

  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_identity from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='IDENTITY' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_licence from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='LICENCE' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_registration from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='REGISTRATION' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_ctp from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='CTP' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_vehicle from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='VEHICLE_OWNERSHIP' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_insurance from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='ADDITIONAL_INSURANCE' and active=true;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='IDENTITY'),false) then
    if v.identity_status='VERIFIED'
       and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status='VERIFIED')
       and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='IDENTITY_DOCUMENT' and d.status='VERIFIED')
    then identity_status:='VERIFIED';
    elsif v.identity_status='REJECTED' then identity_status:='REJECTED';
    elsif v.identity_status='MORE_INFORMATION_REQUIRED' or exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('PROFILE_PHOTO','IDENTITY_DOCUMENT') and d.status='MORE_INFORMATION_REQUIRED') then identity_status:='MORE_INFORMATION_REQUIRED';
    else identity_status:='PENDING'; end if;
  else identity_status:='NOT_REQUIRED'; end if;

  if identity_status<>'VERIFIED' and identity_status<>'NOT_REQUIRED' then
    blocking:=blocking||jsonb_build_array('IDENTITY');
  end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='LICENCE'),false) then
    if v.licence_expiry is not null and v.licence_expiry<current_date then licence_status:='EXPIRED';
    elsif v.licence_status='VERIFIED' and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status='VERIFIED' and coalesce(d.expires_at,v.licence_expiry)>=current_date) then licence_status:='VERIFIED';
    elsif v.licence_status='REJECTED' then licence_status:='REJECTED';
    elsif v.licence_status='MORE_INFORMATION_REQUIRED' then licence_status:='MORE_INFORMATION_REQUIRED';
    else licence_status:='PENDING'; end if;
  else licence_status:='NOT_REQUIRED'; end if;
  if licence_status<>'VERIFIED' and licence_status<>'NOT_REQUIRED' then blocking:=blocking||jsonb_build_array('LICENCE'); end if;

  if dv.id is null then
    vehicle_status:='PENDING'; registration_status:='PENDING'; ctp_status:='PENDING';
  else
    if dv.status='EXPIRED' or dv.registration_expiry<current_date then vehicle_status:='EXPIRED';
    elsif dv.status='VERIFIED' then vehicle_status:='VERIFIED';
    elsif dv.status='REJECTED' then vehicle_status:='REJECTED';
    else vehicle_status:='PENDING'; end if;

    if dv.registration_status='CURRENT' and dv.registration_expiry is not null and dv.registration_expiry>=current_date
       and v.registration_status='VERIFIED'
       and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='REGISTRATION' and d.status='VERIFIED')
    then registration_status:='VERIFIED';
    elsif dv.registration_status='EXPIRED' or dv.registration_expiry<current_date then registration_status:='EXPIRED';
    elsif v.registration_status='REJECTED' or dv.registration_status='REJECTED' then registration_status:='REJECTED';
    elsif v.registration_status='MORE_INFORMATION_REQUIRED' then registration_status:='MORE_INFORMATION_REQUIRED';
    else registration_status:='PENDING'; end if;

    if dv.ctp_expiry is not null and dv.ctp_expiry<current_date then ctp_status:='EXPIRED';
    elsif dv.ctp_expiry is not null and dv.registration_status='CURRENT' and v.registration_status='VERIFIED' then ctp_status:='VERIFIED';
    else ctp_status:='PENDING'; end if;
  end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='VEHICLE_OWNERSHIP'),false) then
    if exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') and d.status='VERIFIED') then
      vehicle_status:=case when vehicle_status='EXPIRED' then vehicle_status else 'VERIFIED' end;
    else
      blocking:=blocking||jsonb_build_array('VEHICLE_OWNERSHIP');
    end if;
  end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='VEHICLE_PHOTOS'),false) then
    if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE') and d.status='VERIFIED') then
      blocking:=blocking||jsonb_build_array('VEHICLE_PHOTOS');
    end if;
  end if;

  if registration_status<>'VERIFIED' then blocking:=blocking||jsonb_build_array('REGISTRATION'); end if;
  if ctp_status<>'VERIFIED' then blocking:=blocking||jsonb_build_array('CTP'); end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='ADDITIONAL_INSURANCE'),false) then
    if v.insurance_expiry is not null and v.insurance_expiry<current_date then insurance_status:='EXPIRED';
    elsif v.insurance_status='VERIFIED' and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='INSURANCE' and d.status='VERIFIED' and coalesce(d.expires_at,v.insurance_expiry)>=current_date) then insurance_status:='VERIFIED';
    elsif v.insurance_status='REJECTED' then insurance_status:='REJECTED';
    elsif v.insurance_status='MORE_INFORMATION_REQUIRED' then insurance_status:='MORE_INFORMATION_REQUIRED';
    else insurance_status:='PENDING'; end if;
    if insurance_status<>'VERIFIED' then blocking:=blocking||jsonb_build_array('ADDITIONAL_INSURANCE'); end if;
  end if;

  if exists(select 1 from public.driver_documents d where d.application_id=a.id and d.status='MORE_INFORMATION_REQUIRED') then
    blocking:=blocking||jsonb_build_array('DOCUMENT_MORE_INFORMATION_REQUIRED');
  end if;

  if exists(select 1 from public.driver_declaration_templates t where t.required=true and t.active=true
            and not exists(select 1 from public.driver_declarations d where d.application_id=a.id and d.declaration_key=t.declaration_key and d.declaration_version=t.version))
  then blocking:=blocking||jsonb_build_array('DECLARATIONS'); end if;

  foreach days in array[30,14,7] loop
    if v.licence_expiry is not null and v.licence_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','LICENCE','days',days,'expires_at',v.licence_expiry));
    end if;
    if dv.registration_expiry is not null and dv.registration_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','REGISTRATION','days',days,'expires_at',dv.registration_expiry)); end if;
    if dv.ctp_expiry is not null and dv.ctp_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','CTP','days',days,'expires_at',dv.ctp_expiry)); end if;
    if v.insurance_expiry is not null and v.insurance_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','INSURANCE','days',days,'expires_at',v.insurance_expiry)); end if;
  end loop;

  if exists(select 1 from public.driver_documents d where d.application_id=a.id and d.expires_at is not null and d.expires_at<current_date and d.status='VERIFIED') then
    blocking:=blocking||jsonb_build_array('EXPIRED_DOCUMENT');
  end if;

  overall_status:=case
    when a.status='SUSPENDED' then 'SUSPENDED'
    when a.status='REJECTED' then 'REJECTED'
    when a.status='EXPIRED' or blocking ? 'EXPIRED_DOCUMENT' or identity_status='EXPIRED' or licence_status='EXPIRED' or registration_status='EXPIRED' or ctp_status='EXPIRED' or insurance_status='EXPIRED' then 'EXPIRED'
    when a.status='MORE_INFORMATION_REQUIRED' or blocking ? 'DOCUMENT_MORE_INFORMATION_REQUIRED' then 'MORE_INFORMATION_REQUIRED'
    when a.status='DRAFT' then 'DRAFT'
    when a.status='SUBMITTED' then 'SUBMITTED'
    when a.status='UNDER_REVIEW' then 'UNDER_REVIEW'
    when a.status='APPROVED' and jsonb_array_length(blocking)=0 then 'APPROVED'
    else 'UNDER_REVIEW'
  end;

  return jsonb_build_object(
    'jurisdiction',jurisdiction,
    'identity',jsonb_build_object('status',identity_status,'reason',case when identity_status='VERIFIED' then null else 'Manual verification required' end,'source',source_identity),
    'licence',jsonb_build_object('status',licence_status,'reason',case when licence_status='VERIFIED' then null else 'Manual verification required' end,'source',source_licence),
    'vehicle',jsonb_build_object('status',vehicle_status,'reason',case when vehicle_status='VERIFIED' then null else 'Manual verification required' end,'source',source_vehicle),
    'registration',jsonb_build_object('status',registration_status,'reason',case when registration_status='VERIFIED' then null else 'Manual verification required' end,'source',source_registration),
    'ctp',jsonb_build_object('status',ctp_status,'reason',case when ctp_status='VERIFIED' then null else 'Manual verification required' end,'source',source_ctp),
    'insurance',jsonb_build_object('status',insurance_status,'reason',case when insurance_status='VERIFIED' then null else 'Manual verification required' end,'source',source_insurance),
    'overall',jsonb_build_object('status',overall_status,'blockingItems',blocking,'expiresSoon',expires_soon)
  );
end;
$$;
revoke execute on function public.evaluate_driver_compliance(uuid) from public,anon;
grant execute on function public.evaluate_driver_compliance(uuid) to authenticated;

create or replace function public.submit_driver_application()
returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; req_count integer; declaration_count integer;
begin
  select * into a from public.driver_applications where user_id=auth.uid() for update;
  if a.id is null then raise exception 'Complete your driver application first'; end if;
  if length(coalesce(a.address_line,''))<3 or length(coalesce(a.suburb,''))<2 or length(coalesce(a.city,''))<2 or length(coalesce(a.state,''))<2 then raise exception 'Complete your residential address'; end if;
  if not exists(select 1 from public.driver_vehicles where application_id=a.id) then raise exception 'Add a vehicle before submitting'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='IDENTITY_DOCUMENT' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload an identity document'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Add a profile photo for identity review'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload the front of your driver licence'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='REGISTRATION' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload registration evidence'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload vehicle ownership or authorisation evidence'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE') and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload a vehicle photo'; end if;
  select count(*) into declaration_count from public.driver_declaration_templates where required=true and active=true and exists(
    select 1 from public.driver_declarations d where d.application_id=a.id and d.declaration_key=driver_declaration_templates.declaration_key and d.declaration_version=driver_declaration_templates.version
  );
  select count(*) into req_count from public.driver_declaration_templates where required=true and active=true;
  if declaration_count<>req_count then raise exception 'Accept all required declarations before submitting'; end if;
  update public.driver_applications set status='SUBMITTED',last_submitted_at=now(),submitted_at=now(),status_reason=null,updated_at=now() where id=a.id;
  insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status) values(a.id,auth.uid(),'APPLICATION_SUBMITTED',a.status,'SUBMITTED');
  insert into public.notifications(user_id,kind,title,body,data) values(auth.uid(),'DRIVER_APPLICATION_SUBMITTED','Driver application submitted','Your Everest driver application is now waiting for review.',jsonb_build_object('application_id',a.id));
  return true;
end;
$$;
revoke execute on function public.submit_driver_application() from public,anon;
grant execute on function public.submit_driver_application() to authenticated;

create or replace function public.admin_set_driver_application(
  p_application_id uuid,p_status text,p_notes text default null
) returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; prev text; reason text; compliance jsonb;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  reason:=nullif(trim(coalesce(p_notes,'')),'');
  if p_status not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED','SUSPENDED') then raise exception 'Invalid driver application status'; end if;
  if p_status in ('MORE_INFORMATION_REQUIRED','REJECTED','SUSPENDED') and reason is null then raise exception 'A reason is required for this action'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  prev:=a.status;
  if p_status='APPROVED' then
    compliance:=public.evaluate_driver_compliance(a.id);
    if jsonb_array_length(compliance->'overall'->'blockingItems')>0 then
      raise exception 'Driver compliance checklist is incomplete: %', compliance->'overall'->'blockingItems';
    end if;
  end if;
  update public.driver_applications set
    status=p_status,
    status_reason=case when p_status in ('MORE_INFORMATION_REQUIRED','REJECTED','SUSPENDED') then reason else null end,
    reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
  where id=a.id;
  insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status,reason)
  values(a.id,auth.uid(),'ADMIN_STATUS_CHANGE',prev,p_status,reason);
  insert into public.admin_actions(admin_id,action,target_type,target_id,metadata)
  values(auth.uid(),'driver_application_status','driver_application',a.id,jsonb_build_object('previous_status',prev,'status',p_status,'reason',reason));
  insert into public.notifications(user_id,kind,title,body,data)
  values(
    a.user_id,'DRIVER_APPLICATION_STATUS',
    case when p_status='APPROVED' then 'Driver application approved'
         when p_status='MORE_INFORMATION_REQUIRED' then 'Action required for your driver application'
         when p_status='REJECTED' then 'Driver application update'
         when p_status='SUSPENDED' then 'Driver account suspended'
         else 'Driver application under review' end,
    case when p_status='APPROVED' then 'Your verification is complete. Driver access is now available when your credentials remain valid.'
         when p_status='MORE_INFORMATION_REQUIRED' then 'Everest needs more information before your application can be approved.'
         else coalesce(reason,'Your driver application status has been updated.') end,
    jsonb_build_object('application_id',a.id,'status',p_status)
  );
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_application(uuid,text,text) from public,anon;
grant execute on function public.admin_set_driver_application(uuid,text,text) to authenticated;

create or replace function public.admin_set_driver_document_status(
  p_document_id uuid,p_status text,p_reason text default null
) returns boolean language plpgsql security definer set search_path=public
as $$
declare d public.driver_documents;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_status not in ('UNDER_REVIEW','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED') then raise exception 'Invalid document status'; end if;
  if p_status in ('MORE_INFORMATION_REQUIRED','REJECTED') and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A reason is required'; end if;
  select * into d from public.driver_documents where id=p_document_id for update;
  if d.id is null then raise exception 'Document not found'; end if;
  update public.driver_documents set
    status=p_status,
    rejection_reason=case when p_status in ('MORE_INFORMATION_REQUIRED','REJECTED') then nullif(trim(p_reason),'') else null end,
    verified_at=case when p_status='VERIFIED' then now() else verified_at end,
    verified_by=case when p_status='VERIFIED' then auth.uid() else verified_by end
  where id=d.id;
  update public.driver_compliance_checks c
    set status=case
      when p_status='VERIFIED' then 'VERIFIED'
      when p_status='MORE_INFORMATION_REQUIRED' then 'MORE_INFORMATION_REQUIRED'
      when p_status='REJECTED' then 'REJECTED'
      else c.status end,
      verification_method=case when p_status='VERIFIED' then 'MANUAL_REVIEW_REQUIRED' else c.verification_method end,
      reviewer_id=case when p_status='VERIFIED' then auth.uid() else c.reviewer_id end,
      reviewed_at=case when p_status='VERIFIED' then now() else c.reviewed_at end,
      reason=nullif(trim(p_reason),''),
      updated_at=now()
  where c.application_id=d.application_id
    and c.requirement_code=case
      when d.document_type in ('PROFILE_PHOTO','IDENTITY_DOCUMENT') then 'IDENTITY'
      when d.document_type in ('LICENCE_FRONT','LICENCE_BACK') then 'LICENCE'
      when d.document_type='REGISTRATION' then 'REGISTRATION'
      when d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') then 'VEHICLE_OWNERSHIP'
      when d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE','VEHICLE_INTERIOR') then 'VEHICLE_PHOTOS'
      when d.document_type='INSURANCE' then 'ADDITIONAL_INSURANCE'
      else c.requirement_code end;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,reason,metadata)
  values(d.application_id,auth.uid(),'DOCUMENT_STATUS_CHANGE',
    (select status from public.driver_applications where id=d.application_id),p_reason,
    jsonb_build_object('document_id',d.id,'document_type',d.document_type,'status',p_status));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_document_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_driver_document_status(uuid,text,text) to authenticated;

create or replace function public.admin_set_driver_vehicle_verification(
  p_application_id uuid,p_registration_status text,p_registration_expiry date,
  p_ctp_provider text,p_ctp_expiry date,p_verification_method text default 'MANUAL_ADMIN_CHECK',
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
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  select * into v from public.driver_vehicles where application_id=a.id for update;
  if v.id is null then raise exception 'Driver vehicle not found'; end if;
  method:=case when p_verification_method='OFFICIAL_API' then 'OFFICIAL_API' else 'MANUAL_REVIEW_REQUIRED' end;
  update public.driver_vehicles set
    registration_expiry=p_registration_expiry,registration_status=p_registration_status,
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
    'ctp_provider',p_ctp_provider,'ctp_expiry',p_ctp_expiry,'method',p_verification_method,
    'provider',p_provider,'reference',p_reference
  ));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_vehicle_verification(uuid,text,date,text,date,text,text,text) from public,anon;
grant execute on function public.admin_set_driver_vehicle_verification(uuid,text,date,text,date,text,text,text) to authenticated;

create or replace function public.admin_set_driver_credential_details(
  p_application_id uuid,p_licence_status text,p_licence_expiry date,
  p_insurance_status text,p_insurance_provider text,p_insurance_policy_reference text,p_insurance_expiry date,
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
  if p_licence_status='VERIFIED' and (p_licence_expiry is null or p_licence_expiry<current_date) then raise exception 'A verified licence must have a current expiry date'; end if;
  if p_insurance_status='VERIFIED' and (p_insurance_expiry is null or p_insurance_expiry<current_date) then raise exception 'Verified insurance must have a current expiry date'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  insert into public.driver_verifications(application_id) values(a.id) on conflict do nothing;
  update public.driver_verifications set
    licence_status=p_licence_status,licence_expiry=p_licence_expiry,
    insurance_status=p_insurance_status,insurance_provider=nullif(trim(coalesce(p_insurance_provider,'')),''),
    insurance_policy_reference=nullif(trim(coalesce(p_insurance_policy_reference,'')),''),
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
    'insurance_status',p_insurance_status,'insurance_expiry',p_insurance_expiry,
    'method',p_verification_method,'provider',p_provider,'reference',p_reference
  ));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,date,text,text,text) to authenticated;

create or replace function public.refresh_driver_verification_status(p_user_id uuid default auth.uid())
returns boolean
language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; dv public.driver_vehicles; v public.driver_verifications; req record; days integer; expired_reason text;
begin
  if p_user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  select * into a from public.driver_applications where user_id=p_user_id for update;
  if a.id is null then return false; end if;
  select * into dv from public.driver_vehicles where application_id=a.id;
  select * into v from public.driver_verifications where application_id=a.id;
  for req in
    select requirement_code from public.driver_compliance_requirements where jurisdiction_code=a.compliance_jurisdiction and active=true and required=true
  loop
    if req.requirement_code='LICENCE' and v.licence_expiry is not null and v.licence_expiry<current_date then
      expired_reason:='Driver licence has expired.';
    elsif req.requirement_code='REGISTRATION' and dv.registration_expiry is not null and dv.registration_expiry<current_date then
      expired_reason:='Vehicle registration has expired.';
    elsif req.requirement_code='CTP' and dv.ctp_expiry is not null and dv.ctp_expiry<current_date then
      expired_reason:='Vehicle CTP information has expired.';
    elsif req.requirement_code='ADDITIONAL_INSURANCE' and v.insurance_expiry is not null and v.insurance_expiry<current_date then
      expired_reason:='Required additional insurance has expired.';
    end if;
    if expired_reason is not null then exit; end if;
  end loop;

  if expired_reason is not null and a.status='APPROVED' then
    update public.driver_applications set status='EXPIRED',status_reason=expired_reason,updated_at=now() where id=a.id;
    insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status,reason)
    values(a.id,auth.uid(),'CREDENTIAL_EXPIRED','APPROVED','EXPIRED',expired_reason);
    insert into public.notifications(user_id,kind,title,body,data)
    values(a.user_id,'DRIVER_CREDENTIAL_EXPIRED','Driver access restricted',expired_reason,jsonb_build_object('application_id',a.id));
  end if;

  for days in 30,14,7 loop
    if v.licence_expiry is not null and v.licence_expiry-current_date=days then
      insert into public.notifications(user_id,kind,title,body,data)
      select a.user_id,'DRIVER_LICENCE_EXPIRY','Driver licence expires soon',
        'Your driver licence expires in '||days||' days.',
        jsonb_build_object('application_id',a.id,'credential','LICENCE','expiry_date',v.licence_expiry,'days',days)
      where not exists(select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_LICENCE_EXPIRY' and n.data->>'expiry_date'=v.licence_expiry::text and n.data->>'days'=days::text);
    end if;
    if dv.registration_expiry is not null and dv.registration_expiry-current_date=days then
      insert into public.notifications(user_id,kind,title,body,data)
      select a.user_id,'DRIVER_REGISTRATION_EXPIRY','Vehicle registration expires soon',
        'Your vehicle registration expires in '||days||' days.',
        jsonb_build_object('application_id',a.id,'credential','REGISTRATION','expiry_date',dv.registration_expiry,'days',days)
      where not exists(select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_REGISTRATION_EXPIRY' and n.data->>'expiry_date'=dv.registration_expiry::text and n.data->>'days'=days::text);
    end if;
    if dv.ctp_expiry is not null and dv.ctp_expiry-current_date=days then
      insert into public.notifications(user_id,kind,title,body,data)
      select a.user_id,'DRIVER_CTP_EXPIRY','CTP expires soon',
        'Your recorded CTP coverage expires in '||days||' days.',
        jsonb_build_object('application_id',a.id,'credential','CTP','expiry_date',dv.ctp_expiry,'days',days)
      where not exists(select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_CTP_EXPIRY' and n.data->>'expiry_date'=dv.ctp_expiry::text and n.data->>'days'=days::text);
    end if;
    if v.insurance_expiry is not null and v.insurance_expiry-current_date=days then
      insert into public.notifications(user_id,kind,title,body,data)
      select a.user_id,'DRIVER_INSURANCE_EXPIRY','Insurance expires soon',
        'Your recorded additional insurance expires in '||days||' days.',
        jsonb_build_object('application_id',a.id,'credential','INSURANCE','expiry_date',v.insurance_expiry,'days',days)
      where not exists(select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_INSURANCE_EXPIRY' and n.data->>'expiry_date'=v.insurance_expiry::text and n.data->>'days'=days::text);
    end if;
  end loop;

  return public.driver_is_operational(p_user_id);
end;
$$;
revoke execute on function public.refresh_driver_verification_status(uuid) from public,anon;
grant execute on function public.refresh_driver_verification_status(uuid) to authenticated;

create or replace function public.driver_is_operational(p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  result:=public.evaluate_driver_compliance((select id from public.driver_applications where user_id=p_user_id));
  return coalesce(result->'overall'->>'status'='APPROVED',false)
    and jsonb_array_length(result->'overall'->'blockingItems')=0;
end;
$$;
revoke execute on function public.driver_is_operational(uuid) from public,anon;
grant execute on function public.driver_is_operational(uuid) to authenticated;

create or replace function public.get_driver_compliance_requirements()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.requirement_code),'[]'::jsonb)
  from public.driver_compliance_requirements r
  where r.jurisdiction_code=coalesce(
    (select compliance_jurisdiction from public.driver_applications where user_id=auth.uid()),
    'AU-NSW'
  ) and r.active=true;
$$;
revoke execute on function public.get_driver_compliance_requirements() from public,anon;
grant execute on function public.get_driver_compliance_requirements() to authenticated;
