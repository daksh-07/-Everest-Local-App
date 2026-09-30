-- Legacy CRM/growth RPCs predate employee roles. Enforce CRM_MANAGE for
-- human-operated CRM and retention mutations while preserving system/service-role flows.

create or replace function public.create_business_contact(
  p_business_id uuid,
  p_display_name text,
  p_phone text default null,
  p_email text default null,
  p_source text default 'MANUAL',
  p_source_detail text default null,
  p_estimated_value numeric default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    public.has_business_permission(p_business_id,'CRM_MANAGE')
    or public.is_admin()
  ) then
    raise exception 'CRM management access is required';
  end if;

  if length(trim(coalesce(p_display_name,'')))<1 then
    raise exception 'Customer name is required';
  end if;
  if p_estimated_value is not null and p_estimated_value<0 then
    raise exception 'Invalid estimated value';
  end if;

  insert into public.business_contacts(
    business_id,display_name,phone,email,source,source_detail,estimated_value,notes,created_by
  )
  values(
    p_business_id,trim(p_display_name),nullif(trim(p_phone),''),
    nullif(lower(trim(p_email)),''),
    coalesce(nullif(trim(p_source),''),'MANUAL'),
    nullif(trim(p_source_detail),''),p_estimated_value,
    nullif(trim(p_notes),''),auth.uid()
  )
  returning id into cid;

  insert into public.crm_activities(
    business_id,contact_id,kind,title,detail,created_by
  )
  values(
    p_business_id,cid,'LEAD_CREATED','Lead created',
    'Source: '||coalesce(nullif(trim(p_source),''),'MANUAL'),auth.uid()
  );

  return cid;
end
$$;

revoke all on function public.create_business_contact(uuid,text,text,text,text,text,numeric,text)
from public,anon;
grant execute on function public.create_business_contact(uuid,text,text,text,text,text,numeric,text)
to authenticated;


create or replace function public.crm_import_contacts(
  p_business_id uuid,
  p_rows jsonb,
  p_source_detail text default null
)
returns jsonb
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
  if not (
    public.has_business_permission(p_business_id,'CRM_MANAGE')
    or public.is_admin()
  ) then
    raise exception 'CRM management access is required';
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then
    raise exception 'Import must contain between 1 and 1000 contacts';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name:=nullif(left(trim(coalesce(v_row->>'name','')),160),'');
    v_email:=nullif(lower(left(trim(coalesce(v_row->>'email','')),254)),'');
    v_phone:=nullif(left(trim(coalesce(v_row->>'phone','')),48),'');
    if v_name is null then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    select id into v_existing
    from public.business_contacts
    where business_id=p_business_id
      and archived_at is null
      and (
        (v_email is not null and lower(email)=v_email)
        or (
          v_phone is not null
          and regexp_replace(coalesce(phone,''),'\D','','g')
            =regexp_replace(v_phone,'\D','','g')
        )
      )
    limit 1;

    if v_existing is not null then
      v_duplicates:=v_duplicates+1;
      continue;
    end if;

    insert into public.business_contacts(
      business_id,display_name,phone,email,company,source,source_detail,
      suburb,city,state,country,notes,created_by,last_activity_at
    )
    values(
      p_business_id,v_name,v_phone,v_email,
      nullif(left(trim(coalesce(v_row->>'company','')),160),''),
      'IMPORT',nullif(left(trim(coalesce(p_source_detail,'')),120),''),
      nullif(left(trim(coalesce(v_row->>'suburb','')),100),''),
      nullif(left(trim(coalesce(v_row->>'city','')),100),''),
      nullif(left(trim(coalesce(v_row->>'state','')),100),''),
      nullif(left(trim(coalesce(v_row->>'country','')),100),''),
      nullif(left(trim(coalesce(v_row->>'notes','')),2000),''),
      v_actor,now()
    );
    v_imported:=v_imported+1;
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    v_actor,'CRM_CONTACTS_IMPORTED','business',p_business_id,
    jsonb_build_object(
      'imported',v_imported,'duplicates',v_duplicates,'skipped',v_skipped
    )
  );

  return jsonb_build_object(
    'imported',v_imported,'duplicates',v_duplicates,'skipped',v_skipped
  );
end
$$;

revoke all on function public.crm_import_contacts(uuid,jsonb,text) from public,anon;
grant execute on function public.crm_import_contacts(uuid,jsonb,text) to authenticated;


create or replace function public.enforce_crm_growth_mutation_permission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare bid uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then bid:=old.business_id; else bid:=new.business_id; end if;

  if bid is null or not public.has_business_permission(bid,'CRM_MANAGE') then
    raise exception 'CRM management access is required';
  end if;

  return case when tg_op='DELETE' then old else new end;
end
$$;

revoke all on function public.enforce_crm_growth_mutation_permission()
from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'business_campaigns',
    'business_membership_plans',
    'business_packages',
    'business_offers',
    'business_loyalty_programs',
    'business_referral_programs'
  ]
  loop
    execute format('drop trigger if exists trg_crm_growth_permission on public.%I',t);
    execute format(
      'create trigger trg_crm_growth_permission before insert or update or delete on public.%I for each row execute function public.enforce_crm_growth_mutation_permission()',
      t
    );
  end loop;
end
$$;

create or replace function public.enforce_customer_membership_business_creation_permission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Stripe/billing automation executes without a user JWT. Customer-side updates
  -- happen after creation and are intentionally outside this INSERT-only guard.
  if auth.uid() is not null
     and not public.is_admin()
     and not public.has_business_permission(new.business_id,'CRM_MANAGE') then
    raise exception 'CRM management access is required';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_customer_membership_business_creation_permission()
from public,anon,authenticated;

drop trigger if exists trg_customer_membership_business_creation_permission
on public.customer_memberships;
create trigger trg_customer_membership_business_creation_permission
before insert on public.customer_memberships
for each row execute function public.enforce_customer_membership_business_creation_permission();
