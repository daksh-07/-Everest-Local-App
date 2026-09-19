-- Preserve the concrete identity/document type without abusing document_type,
-- while retaining immutable historical rows when a document is replaced.

alter table public.driver_documents
  add column if not exists document_subtype text;

drop function if exists public.register_driver_document(uuid,uuid,text,text,text,bigint,date,text,text);
create or replace function public.register_driver_document(
  p_application_id uuid,p_vehicle_id uuid,p_document_type text,p_storage_path text,
  p_mime_type text,p_size_bytes bigint,p_expires_at date default null,
  p_document_number text default null,p_issuing_jurisdiction text default null,
  p_document_subtype text default null
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
  if p_document_subtype is not null and length(trim(p_document_subtype))>80 then raise exception 'Document type is too long'; end if;
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
    application_id,user_id,vehicle_id,document_type,document_subtype,storage_path,mime_type,size_bytes,
    expires_at,document_number,issuing_jurisdiction
  )
  values(
    p_application_id,auth.uid(),p_vehicle_id,p_document_type,nullif(trim(p_document_subtype),''),
    p_storage_path,p_mime_type,p_size_bytes,p_expires_at,
    nullif(trim(p_document_number),''),upper(nullif(trim(p_issuing_jurisdiction),''))
  ) returning id into did;
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata)
  values(p_application_id,auth.uid(),'DOCUMENT_UPLOADED',
    (select status from public.driver_applications where id=p_application_id),
    jsonb_build_object('document_type',p_document_type,'document_subtype',p_document_subtype,'replaced_previous',existing_status is not null));
  return did;
end;
$$;
revoke execute on function public.register_driver_document(uuid,uuid,text,text,text,bigint,date,text,text,text) from public,anon;
grant execute on function public.register_driver_document(uuid,uuid,text,text,text,bigint,date,text,text,text) to authenticated;
