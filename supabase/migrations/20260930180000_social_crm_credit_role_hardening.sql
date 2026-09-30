-- Close residual employee-role bypasses in business social publishing,
-- CRM automation/configuration and manual service-credit redemption.

create or replace function public.enforce_business_social_content_permission()
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

  if bid is not null and not public.has_business_permission(bid,'CATALOG_MANAGE') then
    raise exception 'Business publishing permission is required';
  end if;

  return case when tg_op='DELETE' then old else new end;
end
$$;

revoke all on function public.enforce_business_social_content_permission()
from public,anon,authenticated;

drop trigger if exists trg_business_social_content_permission on public.posts;
create trigger trg_business_social_content_permission
before insert or update or delete on public.posts
for each row execute function public.enforce_business_social_content_permission();

drop trigger if exists trg_business_social_content_permission on public.stories;
create trigger trg_business_social_content_permission
before insert or update or delete on public.stories
for each row execute function public.enforce_business_social_content_permission();


drop policy if exists posts_author_insert on public.posts;
create policy posts_author_insert on public.posts
for insert to authenticated
with check(
  author_id=auth.uid()
  and (
    business_id is null
    or public.has_business_permission(business_id,'CATALOG_MANAGE')
    or public.is_admin()
  )
);

drop policy if exists posts_author_update on public.posts;
create policy posts_author_update on public.posts
for update to authenticated
using(
  (
    author_id=auth.uid()
    and (
      business_id is null
      or public.has_business_permission(business_id,'CATALOG_MANAGE')
    )
  )
  or public.is_admin()
)
with check(
  (
    author_id=auth.uid()
    and (
      business_id is null
      or public.has_business_permission(business_id,'CATALOG_MANAGE')
    )
  )
  or public.is_admin()
);

drop policy if exists posts_author_delete on public.posts;
create policy posts_author_delete on public.posts
for delete to authenticated
using(
  (
    author_id=auth.uid()
    and (
      business_id is null
      or public.has_business_permission(business_id,'CATALOG_MANAGE')
    )
  )
  or public.is_admin()
);

drop policy if exists stories_owner_insert on public.stories;
create policy stories_owner_insert on public.stories
for insert to authenticated
with check(
  author_id=auth.uid()
  and (
    business_id is null
    or public.has_business_permission(business_id,'CATALOG_MANAGE')
    or public.is_admin()
  )
);

drop policy if exists stories_owner_update on public.stories;
create policy stories_owner_update on public.stories
for update to authenticated
using(
  (
    author_id=auth.uid()
    and (
      business_id is null
      or public.has_business_permission(business_id,'CATALOG_MANAGE')
    )
  )
  or public.is_admin()
)
with check(
  (
    author_id=auth.uid()
    and (
      business_id is null
      or public.has_business_permission(business_id,'CATALOG_MANAGE')
    )
  )
  or public.is_admin()
);

drop policy if exists stories_owner_delete on public.stories;
create policy stories_owner_delete on public.stories
for delete to authenticated
using(
  (
    author_id=auth.uid()
    and (
      business_id is null
      or public.has_business_permission(business_id,'CATALOG_MANAGE')
    )
  )
  or public.is_admin()
);


create or replace function public.enforce_post_collaboration_business_permission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare parent_business uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return case when tg_op='DELETE' then old else new end;
  end if;

  select p.business_id into parent_business
  from public.posts p
  where p.id=case when tg_op='INSERT' then new.post_id else old.post_id end;

  if tg_op='INSERT'
     and parent_business is not null
     and not public.has_business_permission(parent_business,'CATALOG_MANAGE') then
    raise exception 'Business publishing permission is required';
  end if;

  if tg_op='UPDATE'
     and new.collaborator_business_id is not null
     and new.status is distinct from old.status
     and not public.has_business_permission(new.collaborator_business_id,'CATALOG_MANAGE') then
    raise exception 'Business publishing permission is required';
  end if;

  return case when tg_op='DELETE' then old else new end;
end
$$;

revoke all on function public.enforce_post_collaboration_business_permission()
from public,anon,authenticated;

drop trigger if exists trg_post_collaboration_business_permission on public.post_collaborators;
create trigger trg_post_collaboration_business_permission
before insert or update on public.post_collaborators
for each row execute function public.enforce_post_collaboration_business_permission();


create or replace function public.crm_create_automation(
  p_business_id uuid,
  p_name text,
  p_trigger_type text,
  p_action_type text,
  p_action_config jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare a uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    public.has_business_permission(p_business_id,'CRM_MANAGE')
    or public.is_admin()
  ) then
    raise exception 'CRM management access is required';
  end if;

  if p_action_type not in (
    'CREATE_TASK','ADD_TAG','REMOVE_TAG','UPDATE_DEAL_STAGE',
    'CREATE_INTERNAL_NOTE','CREATE_NOTIFICATION','CREATE_FOLLOW_UP','CALL_WEBHOOK'
  ) then
    raise exception 'Unsupported action';
  end if;

  insert into public.crm_automations(business_id,name,trigger_type,created_by)
  values(p_business_id,trim(p_name),p_trigger_type,auth.uid())
  returning id into a;

  insert into public.crm_automation_actions(
    business_id,automation_id,action_type,action_config
  )
  values(p_business_id,a,p_action_type,coalesce(p_action_config,'{}'));

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'AUTOMATION_CREATED','crm_automation',a,
    jsonb_build_object('business_id',p_business_id)
  );

  return a;
end
$$;

create or replace function public.crm_set_automation_status(
  p_business_id uuid,
  p_automation_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    public.has_business_permission(p_business_id,'CRM_MANAGE')
    or public.is_admin()
  ) then
    raise exception 'CRM management access is required';
  end if;

  if p_status not in ('DRAFT','ACTIVE','PAUSED') then
    raise exception 'Invalid status';
  end if;

  update public.crm_automations
  set status=p_status,updated_at=now()
  where id=p_automation_id and business_id=p_business_id;

  if not found then raise exception 'Automation not found'; end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    case when p_status='ACTIVE' then 'AUTOMATION_ENABLED' else 'AUTOMATION_DISABLED' end,
    'crm_automation',p_automation_id,
    jsonb_build_object('business_id',p_business_id,'status',p_status)
  );

  return true;
end
$$;

create or replace function public.crm_configure_calendar_connection(
  p_business_id uuid,
  p_connection_id uuid,
  p_import_busy boolean,
  p_export_marketplace boolean,
  p_export_crm boolean,
  p_export_tasks boolean,
  p_sync_direction text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    public.has_business_permission(p_business_id,'CRM_MANAGE')
    or public.is_admin()
  ) then
    raise exception 'CRM management access is required';
  end if;

  update public.calendar_connections
  set import_busy_time=p_import_busy,
      export_marketplace_bookings=p_export_marketplace,
      export_crm_bookings=p_export_crm,
      export_tasks=p_export_tasks,
      sync_direction=p_sync_direction,
      sync_enabled=true,
      updated_at=now()
  where id=p_connection_id and business_id=p_business_id;

  if not found then raise exception 'Connection not found'; end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'CALENDAR_SYNC_ENABLED','calendar_connection',p_connection_id,
    jsonb_build_object('business_id',p_business_id)
  );

  return true;
end
$$;

revoke all on function public.crm_create_automation(uuid,text,text,text,jsonb)
from public,anon;
revoke all on function public.crm_set_automation_status(uuid,uuid,text)
from public,anon;
revoke all on function public.crm_configure_calendar_connection(uuid,uuid,boolean,boolean,boolean,boolean,text)
from public,anon;

grant execute on function public.crm_create_automation(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.crm_set_automation_status(uuid,uuid,text) to authenticated;
grant execute on function public.crm_configure_calendar_connection(uuid,uuid,boolean,boolean,boolean,boolean,text) to authenticated;


create or replace function public.enforce_manual_service_credit_permission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Stripe invoice/package grants are trusted server operations and have no
  -- authenticated created_by actor. Human redemption must be CRM-authorized.
  if auth.uid() is not null
     and new.created_by is not null
     and not public.is_admin()
     and not public.has_business_permission(new.business_id,'CRM_MANAGE') then
    raise exception 'CRM management access is required to redeem service credits';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_manual_service_credit_permission()
from public,anon,authenticated;

drop trigger if exists trg_manual_service_credit_permission on public.service_credit_ledger;
create trigger trg_manual_service_credit_permission
before insert on public.service_credit_ledger
for each row execute function public.enforce_manual_service_credit_permission();
