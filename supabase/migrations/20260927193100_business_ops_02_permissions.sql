-- ---------- ROLE / PERMISSION ENGINE ----------

create or replace function public.business_role_has_permission(p_role text,p_permission text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case upper(coalesce(p_role,''))
    when 'OWNER' then true
    when 'ADMIN' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW','TEAM_MANAGE','JOB_VIEW_ALL','JOB_ASSIGN','JOB_UPDATE_ALL',
      'CRM_VIEW','CRM_MANAGE','INBOX_VIEW_ALL','FINANCE_VIEW','FINANCE_MANAGE',
      'CATALOG_MANAGE','ORDERS_VIEW','ORDERS_MANAGE','SETTINGS_MANAGE','ANALYTICS_VIEW'
    ])
    when 'OPERATIONS_MANAGER' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW','TEAM_MANAGE','JOB_VIEW_ALL','JOB_ASSIGN','JOB_UPDATE_ALL',
      'CRM_VIEW','INBOX_VIEW_ALL','ORDERS_VIEW','ANALYTICS_VIEW'
    ])
    when 'MANAGER' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW','TEAM_MANAGE','JOB_VIEW_ALL','JOB_ASSIGN','JOB_UPDATE_ALL',
      'CRM_VIEW','INBOX_VIEW_ALL','ORDERS_VIEW','ANALYTICS_VIEW'
    ])
    when 'DISPATCHER' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW','JOB_VIEW_ALL','JOB_ASSIGN','JOB_UPDATE_ALL','INBOX_VIEW_ALL'
    ])
    when 'FINANCE' then upper(p_permission)=any(array[
      'FINANCE_VIEW','FINANCE_MANAGE','ANALYTICS_VIEW'
    ])
    when 'CRM_SALES' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW','JOB_VIEW_ALL','CRM_VIEW','CRM_MANAGE','INBOX_VIEW_ALL','ANALYTICS_VIEW'
    ])
    when 'TEAM_LEADER' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW'
    ])
    when 'TECHNICIAN' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW'
    ])
    when 'CONTRACTOR' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW'
    ])
    when 'STAFF' then upper(p_permission)=any(array[
      'OPERATIONS_VIEW','TEAM_VIEW'
    ])
    when 'READ_ONLY' then upper(p_permission)=any(array[
      'TEAM_VIEW','ANALYTICS_VIEW'
    ])
    else false
  end
$$;

revoke all on function public.business_role_has_permission(text,text) from public,anon,authenticated;

create or replace function public.is_active_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.business_members bm
    where bm.business_id=p_business_id
      and bm.user_id=auth.uid()
      and bm.status='ACTIVE'
  )
$$;
revoke all on function public.is_active_business_member(uuid) from public,anon;
grant execute on function public.is_active_business_member(uuid) to authenticated;

create or replace function public.has_business_permission(p_business_id uuid,p_permission text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (
      select o.allowed
      from public.business_member_permission_overrides o
      where o.business_id=p_business_id
        and o.user_id=auth.uid()
        and o.permission=upper(p_permission)
    ),
    (
      select public.business_role_has_permission(bm.member_role,upper(p_permission))
      from public.business_members bm
      where bm.business_id=p_business_id
        and bm.user_id=auth.uid()
        and bm.status='ACTIVE'
    ),
    false
  )
$$;
revoke all on function public.has_business_permission(uuid,text) from public,anon;
grant execute on function public.has_business_permission(uuid,text) to authenticated;

create or replace function public.can_operate_business_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 select
   public.is_admin()
   or exists(
     select 1 from public.bookings b
     where b.id=p_booking_id and (
       public.has_business_permission(b.business_id,'JOB_UPDATE_ALL')
       or exists(
         select 1
         from public.business_job_assignments a
         where a.booking_id=b.id
           and a.business_id=b.business_id
           and a.status not in ('DECLINED','CANCELLED')
           and (
             a.assigned_user_id=auth.uid()
             or exists(
               select 1 from public.business_team_members tm
               join public.business_members bm
                 on bm.business_id=tm.business_id and bm.user_id=tm.user_id and bm.status='ACTIVE'
               where tm.business_id=a.business_id
                 and tm.team_id=a.team_id
                 and tm.user_id=auth.uid()
             )
           )
       )
     )
   )
$$;
revoke all on function public.can_operate_business_booking(uuid) from public,anon;
grant execute on function public.can_operate_business_booking(uuid) to authenticated;

create or replace function public.can_access_business_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 select exists(
   select 1 from public.conversations c
   where c.id=p_conversation_id
     and (
       c.customer_id=auth.uid()
       or public.is_admin()
       or public.has_business_permission(c.business_id,'INBOX_VIEW_ALL')
       or (c.booking_id is not null and public.can_operate_business_booking(c.booking_id))
     )
 )
$$;
revoke all on function public.can_access_business_conversation(uuid) from public,anon;
grant execute on function public.can_access_business_conversation(uuid) to authenticated;

