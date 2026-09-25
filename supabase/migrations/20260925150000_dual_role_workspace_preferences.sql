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
