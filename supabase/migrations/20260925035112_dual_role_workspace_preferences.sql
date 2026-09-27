-- Dual-role customer/business workspace preferences.
-- UI mode is never an authorization boundary; RLS/business membership remains authoritative.

create table if not exists public.user_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_mode text not null default 'CUSTOMER' check (app_mode in ('CUSTOMER','BUSINESS')),
  active_business_id uuid null references public.businesses(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.user_workspace_preferences enable row level security;
drop policy if exists user_workspace_preferences_self_read on public.user_workspace_preferences;
create policy user_workspace_preferences_self_read on public.user_workspace_preferences for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.user_workspace_preferences from public,anon,authenticated;
grant select on public.user_workspace_preferences to authenticated;

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
    'verification_status',b.verification_status::text,'member_role',bm.member_role,
    'suburb',b.suburb,'city',b.city,'state',b.state
  ) order by b.name),'[]'::jsonb)
  into v_businesses
  from public.business_members bm
  join public.businesses b on b.id=bm.business_id
  where bm.user_id=v_uid;

  select app_mode,active_business_id into v_pref
  from public.user_workspace_preferences where user_id=v_uid;

  v_mode:=coalesce(v_pref.app_mode,'CUSTOMER');
  v_active:=v_pref.active_business_id;

  if v_mode='BUSINESS' and not exists(
    select 1 from public.business_members bm where bm.user_id=v_uid and bm.business_id=v_active
  ) then
    select bm.business_id into v_active from public.business_members bm where bm.user_id=v_uid order by bm.created_at limit 1;
    if v_active is null then v_mode:='CUSTOMER'; end if;
  end if;

  return jsonb_build_object('mode',v_mode,'active_business_id',case when v_mode='BUSINESS' then v_active else null end,'businesses',v_businesses);
end;$$;

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
    if not exists(select 1 from public.business_members bm where bm.user_id=v_uid and bm.business_id=p_active_business_id) then
      raise exception 'Business access denied';
    end if;
  end if;

  insert into public.user_workspace_preferences(user_id,app_mode,active_business_id,updated_at)
  values(v_uid,p_mode,case when p_mode='BUSINESS' then p_active_business_id else null end,now())
  on conflict(user_id) do update set app_mode=excluded.app_mode,active_business_id=excluded.active_business_id,updated_at=now();
  return true;
end;$$;

revoke all on function public.get_my_workspace_context() from public,anon;
revoke all on function public.set_my_workspace_preference(text,uuid) from public,anon;
grant execute on function public.get_my_workspace_context() to authenticated;
grant execute on function public.set_my_workspace_preference(text,uuid) to authenticated;


-- Multi-business-safe quote submission. This reuses the existing quote lifecycle,
-- but requires the client-selected business to be a real authenticated membership.
create or replace function public.send_quote_for_business(
  p_business_id uuid,
  p_request_id uuid,
  p_service_id uuid,
  p_description text,
  p_line_items jsonb,
  p_price numeric,
  p_deposit numeric,
  p_total numeric,
  p_proposed_date date,
  p_proposed_time time without time zone,
  p_valid_until timestamptz,
  p_terms text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_quote_id uuid;
  v_customer_id uuid;
  v_request_status public.request_status;
  v_verified boolean;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1 from public.business_members bm
    where bm.user_id=v_uid and bm.business_id=p_business_id
  ) then
    raise exception 'Business access denied';
  end if;

  select r.customer_id,r.status
  into v_customer_id,v_request_status
  from public.service_requests r
  where r.id=p_request_id
  for update;

  if v_customer_id is null then raise exception 'Request not found'; end if;
  if v_request_status <> 'QUOTING' then raise exception 'Request is not accepting quotes'; end if;

  if not exists(
    select 1 from public.opportunities o
    where o.request_id=p_request_id
      and o.business_id=p_business_id
      and o.status='OPEN'
    for update
  ) then
    raise exception 'No authorized opportunity';
  end if;

  select b.verification_status='VERIFIED'
  into v_verified
  from public.businesses b
  where b.id=p_business_id;

  if not coalesce(v_verified,false) then
    raise exception 'Verified business access is required';
  end if;

  if p_service_id is not null and not exists(
    select 1 from public.services s
    where s.id=p_service_id
      and s.business_id=p_business_id
      and s.active
  ) then
    raise exception 'Selected service is not owned and active for this business';
  end if;

  if p_price is null or p_deposit is null or p_total is null
     or p_price<0 or p_deposit<0 or p_total<0 or p_total<p_deposit then
    raise exception 'Invalid quote amounts';
  end if;

  if p_valid_until is not null and p_valid_until<=now() then
    raise exception 'Quote expiry must be in the future';
  end if;

  insert into public.quotes(
    request_id,business_id,customer_id,service_id,description,line_items,
    price,deposit,total,proposed_date,proposed_time,valid_until,terms,status
  )
  values(
    p_request_id,p_business_id,v_customer_id,p_service_id,trim(coalesce(p_description,'')),
    coalesce(p_line_items,'[]'::jsonb),p_price,p_deposit,p_total,p_proposed_date,
    p_proposed_time,p_valid_until,p_terms,'SENT'
  )
  returning id into v_quote_id;

  update public.opportunities
  set status='RESPONDED'
  where request_id=p_request_id
    and business_id=p_business_id
    and status='OPEN';

  insert into public.notifications(user_id,kind,title,body,data)
  values(
    v_customer_id,'NEW_QUOTE','New quote received','A business has sent you a quote.',
    jsonb_build_object('quote_id',v_quote_id,'request_id',p_request_id,'business_id',p_business_id)
  );

  return v_quote_id;
end;$$;

revoke all on function public.send_quote_for_business(uuid,uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamptz,text) from public,anon;
grant execute on function public.send_quote_for_business(uuid,uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamptz,text) to authenticated;
