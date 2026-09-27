-- Safe, tenant-scoped bulk contact import for CSV and device-contact review.
-- The client can submit only an explicit reviewed batch; duplicate matching and
-- writes remain in this server-authoritative function.
create or replace function public.crm_import_contacts(
  p_business_id uuid,
  p_rows jsonb,
  p_source_detail text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_row jsonb;
  v_name text;
  v_email text;
  v_phone text;
  v_existing uuid;
  v_imported integer:=0;
  v_duplicates integer:=0;
  v_skipped integer:=0;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_business_member(p_business_id) then raise exception 'Business access unavailable'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)>1000 then raise exception 'Import must contain between 1 and 1000 contacts'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name:=nullif(left(trim(coalesce(v_row->>'name','')),160),'');
    v_email:=nullif(lower(left(trim(coalesce(v_row->>'email','')),254)),'');
    v_phone:=nullif(left(trim(coalesce(v_row->>'phone','')),48),'');
    if v_name is null then v_skipped:=v_skipped+1; continue; end if;

    select id into v_existing from public.business_contacts
      where business_id=p_business_id and archived_at is null
        and ((v_email is not null and lower(email)=v_email)
          or (v_phone is not null and regexp_replace(coalesce(phone,''),'\\D','','g')=regexp_replace(v_phone,'\\D','','g')))
      limit 1;
    if v_existing is not null then v_duplicates:=v_duplicates+1; continue; end if;

    insert into public.business_contacts(
      business_id,display_name,phone,email,company,source,source_detail,suburb,city,state,country,notes,created_by,last_activity_at
    ) values (
      p_business_id,v_name,v_phone,v_email,
      nullif(left(trim(coalesce(v_row->>'company','')),160),''),'IMPORT',nullif(left(trim(coalesce(p_source_detail,'')),120),''),
      nullif(left(trim(coalesce(v_row->>'suburb','')),100),''),nullif(left(trim(coalesce(v_row->>'city','')),100),''),
      nullif(left(trim(coalesce(v_row->>'state','')),100),''),nullif(left(trim(coalesce(v_row->>'country','')),100),''),
      nullif(left(trim(coalesce(v_row->>'notes','')),2000),''),v_actor,now()
    );
    v_imported:=v_imported+1;
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'CRM_CONTACTS_IMPORTED','business',p_business_id,jsonb_build_object('imported',v_imported,'duplicates',v_duplicates,'skipped',v_skipped));
  return jsonb_build_object('imported',v_imported,'duplicates',v_duplicates,'skipped',v_skipped);
end;
$$;
revoke all on function public.crm_import_contacts(uuid,jsonb,text) from public,anon;
grant execute on function public.crm_import_contacts(uuid,jsonb,text) to authenticated;
