-- ---------- WORKSPACE CONTEXT ----------

create or replace function public.get_my_workspace_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_pref record;
  v_businesses jsonb;
  v_active uuid;
  v_mode text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'name',b.name,'logo_url',b.logo_url,'status',b.status::text,
    'verification_status',b.verification_status::text,'member_role',bm.member_role,'member_status',bm.status,
    'suburb',b.suburb,'city',b.city,'state',b.state,
    'can_view_team',public.has_business_permission(b.id,'TEAM_VIEW'),
    'can_manage_team',public.has_business_permission(b.id,'TEAM_MANAGE'),
    'can_assign_jobs',public.has_business_permission(b.id,'JOB_ASSIGN'),
    'can_view_all_jobs',public.has_business_permission(b.id,'JOB_VIEW_ALL'),
    'can_view_crm',public.has_business_permission(b.id,'CRM_VIEW'),
    'can_manage_crm',public.has_business_permission(b.id,'CRM_MANAGE'),
    'can_view_inbox',public.has_business_permission(b.id,'INBOX_VIEW_ALL'),
    'can_view_finance',public.has_business_permission(b.id,'FINANCE_VIEW'),
    'can_manage_finance',public.has_business_permission(b.id,'FINANCE_MANAGE'),
    'can_manage_payouts',public.has_business_permission(b.id,'PAYOUTS_MANAGE'),
    'can_manage_catalog',public.has_business_permission(b.id,'CATALOG_MANAGE'),
    'can_view_orders',public.has_business_permission(b.id,'ORDERS_VIEW'),
    'can_manage_orders',public.has_business_permission(b.id,'ORDERS_MANAGE'),
    'can_manage_settings',public.has_business_permission(b.id,'SETTINGS_MANAGE')
  ) order by b.name),'[]'::jsonb)
  into v_businesses
  from public.business_members bm
  join public.businesses b on b.id=bm.business_id
  where bm.user_id=v_uid and bm.status='ACTIVE';

  select app_mode,active_business_id into v_pref
  from public.user_workspace_preferences where user_id=v_uid;

  v_mode:=coalesce(v_pref.app_mode,'CUSTOMER');
  v_active:=v_pref.active_business_id;

  if v_mode='BUSINESS' and not exists(
    select 1 from public.business_members bm where bm.user_id=v_uid and bm.business_id=v_active and bm.status='ACTIVE'
  ) then
    select bm.business_id into v_active
    from public.business_members bm
    where bm.user_id=v_uid and bm.status='ACTIVE'
    order by bm.created_at limit 1;
    if v_active is null then v_mode:='CUSTOMER'; end if;
  end if;

  return jsonb_build_object('mode',v_mode,'active_business_id',case when v_mode='BUSINESS' then v_active else null end,'businesses',v_businesses);
end
$$;
revoke all on function public.get_my_workspace_context() from public,anon;
grant execute on function public.get_my_workspace_context() to authenticated;

create or replace function public.set_my_workspace_preference(p_mode text,p_active_business_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('CUSTOMER','BUSINESS') then raise exception 'Invalid app mode'; end if;
  if p_mode='BUSINESS' then
    if p_active_business_id is null then raise exception 'Business is required'; end if;
    if not exists(
      select 1 from public.business_members bm
      where bm.user_id=v_uid and bm.business_id=p_active_business_id and bm.status='ACTIVE'
    ) then raise exception 'Business access denied'; end if;
  end if;
  insert into public.user_workspace_preferences(user_id,app_mode,active_business_id,updated_at)
  values(v_uid,p_mode,case when p_mode='BUSINESS' then p_active_business_id else null end,now())
  on conflict(user_id) do update set app_mode=excluded.app_mode,active_business_id=excluded.active_business_id,updated_at=now();
  return true;
end
$$;
revoke all on function public.set_my_workspace_preference(text,uuid) from public,anon;
grant execute on function public.set_my_workspace_preference(text,uuid) to authenticated;

-- ---------- RLS HARDENING ----------

alter table public.business_locations enable row level security;
alter table public.business_staff_invitations enable row level security;
alter table public.business_member_permission_overrides enable row level security;
alter table public.business_teams enable row level security;
alter table public.business_team_members enable row level security;
alter table public.business_member_skills enable row level security;
alter table public.business_staff_shifts enable row level security;
alter table public.business_job_assignments enable row level security;
alter table public.business_job_events enable row level security;

revoke all on public.business_locations,public.business_staff_invitations,public.business_member_permission_overrides,
  public.business_teams,public.business_team_members,public.business_member_skills,public.business_staff_shifts,
  public.business_job_assignments,public.business_job_events from public,anon,authenticated;

grant select on public.business_locations,public.business_teams,public.business_team_members,
  public.business_member_skills,public.business_staff_shifts,public.business_job_assignments,public.business_job_events
to authenticated;

drop policy if exists business_locations_member_read on public.business_locations;
create policy business_locations_member_read on public.business_locations for select to authenticated
using(public.is_active_business_member(business_id));

drop policy if exists business_teams_member_read on public.business_teams;
create policy business_teams_member_read on public.business_teams for select to authenticated
using(public.has_business_permission(business_id,'TEAM_VIEW'));

drop policy if exists business_team_members_member_read on public.business_team_members;
create policy business_team_members_member_read on public.business_team_members for select to authenticated
using(public.has_business_permission(business_id,'TEAM_VIEW'));

drop policy if exists business_member_skills_member_read on public.business_member_skills;
create policy business_member_skills_member_read on public.business_member_skills for select to authenticated
using(public.has_business_permission(business_id,'TEAM_VIEW') or user_id=auth.uid());

drop policy if exists business_staff_shifts_scope_read on public.business_staff_shifts;
create policy business_staff_shifts_scope_read on public.business_staff_shifts for select to authenticated
using(user_id=auth.uid() or public.has_business_permission(business_id,'TEAM_VIEW'));

drop policy if exists business_job_assignments_scope_read on public.business_job_assignments;
create policy business_job_assignments_scope_read on public.business_job_assignments for select to authenticated
using(
  public.has_business_permission(business_id,'JOB_VIEW_ALL')
  or assigned_user_id=auth.uid()
  or exists(
    select 1 from public.business_team_members tm
    where tm.business_id=business_job_assignments.business_id
      and tm.team_id=business_job_assignments.team_id
      and tm.user_id=auth.uid()
  )
);

drop policy if exists business_job_events_scope_read on public.business_job_events;
create policy business_job_events_scope_read on public.business_job_events for select to authenticated
using(
  public.has_business_permission(business_id,'JOB_VIEW_ALL')
  or exists(
    select 1 from public.business_job_assignments a
    where a.id=business_job_events.assignment_id
      and (
        a.assigned_user_id=auth.uid()
        or exists(select 1 from public.business_team_members tm where tm.business_id=a.business_id and tm.team_id=a.team_id and tm.user_id=auth.uid())
      )
  )
);

-- Existing team membership listing stays readable by active members but remains non-mutable from clients.
drop policy if exists business_members_access on public.business_members;
create policy business_members_access on public.business_members for select to authenticated
using(
  user_id=auth.uid()
  or (status<>'REMOVED' and public.has_business_permission(business_id,'TEAM_VIEW'))
  or public.is_admin()
);
revoke insert,update,delete on public.business_members from anon,authenticated;
grant select on public.business_members to authenticated;

-- Core marketplace objects: broad staff membership no longer implies access to all jobs/quotes/messages/money.
drop policy if exists bookings_participant_access on public.bookings;
create policy bookings_participant_access on public.bookings for select to authenticated
using(
  customer_id=auth.uid()
  or public.is_admin()
  or public.has_business_permission(business_id,'JOB_VIEW_ALL')
  or public.can_operate_business_booking(id)
);

drop policy if exists payouts_business_admin on public.payouts;
create policy payouts_business_admin on public.payouts for select to authenticated
using(public.has_business_permission(business_id,'FINANCE_VIEW') or public.is_admin());

drop policy if exists marketplace_payout_ledger_business_read on public.marketplace_payout_ledger;
create policy marketplace_payout_ledger_business_read on public.marketplace_payout_ledger for select to authenticated
using(public.has_business_permission(business_id,'FINANCE_VIEW') or public.is_admin());

drop policy if exists service_payments_read on public.service_payments;
create policy service_payments_read on public.service_payments for select to authenticated
using(
  customer_id=auth.uid()
  or public.is_admin()
  or exists(
    select 1 from public.bookings b
    where b.id=service_payments.booking_id
      and public.has_business_permission(b.business_id,'FINANCE_VIEW')
  )
);

drop policy if exists conversations_participant on public.conversations;
create policy conversations_participant on public.conversations for select to authenticated
using(public.can_access_business_conversation(id));

drop policy if exists messages_participant_read on public.messages;
create policy messages_participant_read on public.messages for select to authenticated
using(public.can_access_business_conversation(conversation_id));

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages for insert to authenticated
with check(
  sender_id=auth.uid()
  and public.can_access_business_conversation(conversation_id)
);

drop policy if exists booking_job_records_participant_read on public.booking_job_records;
create policy booking_job_records_participant_read on public.booking_job_records for select to authenticated
using(customer_id=auth.uid() or public.is_admin() or public.can_operate_business_booking(booking_id));

drop policy if exists booking_job_checklist_participant_read on public.booking_job_checklist_items;
create policy booking_job_checklist_participant_read on public.booking_job_checklist_items for select to authenticated
using(
  exists(
    select 1 from public.booking_job_records r
    where r.booking_id=booking_job_checklist_items.booking_id
      and (r.customer_id=auth.uid() or public.is_admin() or public.can_operate_business_booking(r.booking_id))
  )
);

-- CRM is split into view/manage permissions. All mutation RPCs are SECURITY INVOKER, so these policies
-- remain authoritative even if an old function still performs a legacy membership pre-check.
do $$
declare t text;
begin
 foreach t in array array[
   'business_contacts','crm_activities','crm_bookings','crm_calendar_blocks','crm_contact_tags',
   'crm_notes','crm_opportunities','crm_pipeline_stages','crm_pipelines','crm_quote_items','crm_quotes',
   'crm_tags','crm_tasks'
 ] loop
   execute format('drop policy if exists %I on public.%I',t||'_member_all',t);
   execute format('drop policy if exists %I on public.%I',t||'_permission_read',t);
   execute format('drop policy if exists %I on public.%I',t||'_permission_insert',t);
   execute format('drop policy if exists %I on public.%I',t||'_permission_update',t);
   execute format('drop policy if exists %I on public.%I',t||'_permission_delete',t);
   execute format('create policy %I on public.%I for select to authenticated using (public.has_business_permission(business_id,''CRM_VIEW'') or public.is_admin())',t||'_permission_read',t);
   execute format('create policy %I on public.%I for insert to authenticated with check (public.has_business_permission(business_id,''CRM_MANAGE'') or public.is_admin())',t||'_permission_insert',t);
   execute format('create policy %I on public.%I for update to authenticated using (public.has_business_permission(business_id,''CRM_MANAGE'') or public.is_admin()) with check (public.has_business_permission(business_id,''CRM_MANAGE'') or public.is_admin())',t||'_permission_update',t);
   execute format('create policy %I on public.%I for delete to authenticated using (public.has_business_permission(business_id,''CRM_MANAGE'') or public.is_admin())',t||'_permission_delete',t);
 end loop;
end
$$;

do $$
declare t text;
begin
 foreach t in array array['crm_automations','crm_automation_actions','crm_automation_conditions','crm_automation_runs'] loop
   execute format('drop policy if exists %I on public.%I',t||'_member_select',t);
   execute format('drop policy if exists %I on public.%I',t||'_permission_read',t);
   execute format('create policy %I on public.%I for select to authenticated using (public.has_business_permission(business_id,''CRM_VIEW'') or public.is_admin())',t||'_permission_read',t);
 end loop;
end
$$;

-- Catalog + order policies become role-aware.
drop policy if exists services_business_insert on public.services;
drop policy if exists services_business_update on public.services;
drop policy if exists services_business_delete on public.services;
create policy services_business_insert on public.services for insert to authenticated
with check(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin());
create policy services_business_update on public.services for update to authenticated
using(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin())
with check(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin());
create policy services_business_delete on public.services for delete to authenticated
using(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin());

drop policy if exists products_business_insert on public.products;
drop policy if exists products_business_update on public.products;
drop policy if exists products_business_delete on public.products;
create policy products_business_insert on public.products for insert to authenticated
with check(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin());
create policy products_business_update on public.products for update to authenticated
using(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin())
with check(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin());
create policy products_business_delete on public.products for delete to authenticated
using(public.has_business_permission(business_id,'CATALOG_MANAGE') or public.is_admin());

drop policy if exists orders_participant on public.orders;
create policy orders_participant on public.orders for select to authenticated
using(customer_id=auth.uid() or public.has_business_permission(business_id,'ORDERS_VIEW') or public.is_admin());

drop policy if exists quotes_participant_access on public.quotes;
create policy quotes_participant_access on public.quotes for select to authenticated
using(customer_id=auth.uid() or public.has_business_permission(business_id,'CRM_VIEW') or public.is_admin());
