-- Settings, privacy and support infrastructure. Profile authority remains RPC-only.

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quote_updates boolean not null default true,
  booking_updates boolean not null default true,
  message_updates boolean not null default true,
  order_updates boolean not null default true,
  delivery_updates boolean not null default true,
  business_opportunities boolean not null default true,
  marketing_updates boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  category text not null check (length(trim(category)) between 2 and 40),
  subject text not null check (length(trim(subject)) between 3 and 120),
  message text not null check (length(trim(message)) between 10 and 4000),
  status text not null default 'OPEN' check (status in ('OPEN','IN_REVIEW','RESOLVED','CLOSED')),
  email_status text not null default 'PENDING' check (email_status in ('PENDING','SENT','FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_user_created_idx on public.support_requests(user_id,created_at desc);
alter table public.user_notification_preferences enable row level security;
alter table public.support_requests enable row level security;

create policy user_notification_preferences_self_read on public.user_notification_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy support_requests_self_insert on public.support_requests for insert to authenticated with check ((select auth.uid())=user_id and status='OPEN' and email_status='PENDING');
create policy support_requests_self_read on public.support_requests for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.user_notification_preferences from public,anon,authenticated;
revoke all on public.support_requests from public,anon,authenticated;
grant select on public.user_notification_preferences to authenticated;
grant select,insert on public.support_requests to authenticated;

create or replace function public.update_my_profile_settings(
  p_full_name text,p_bio text default null,p_phone text default null,p_suburb text default null,p_city text default null,p_state text default null,p_visibility text default 'PUBLIC'
) returns boolean language plpgsql security definer set search_path to public as $$
declare v_uid uuid:=auth.uid();v_name text:=nullif(regexp_replace(trim(p_full_name),'\\s+',' ','g'),'');v_bio text:=nullif(trim(p_bio),'');v_phone text:=nullif(trim(p_phone),'');
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if v_name is null or length(v_name) not between 2 and 80 then raise exception 'Invalid display name'; end if;
 if v_bio is not null and length(v_bio)>300 then raise exception 'Bio is too long'; end if;
 if v_phone is not null and (length(v_phone) not between 7 and 30 or v_phone!~'^[+()0-9 .-]+$') then raise exception 'Invalid phone number'; end if;
 if p_visibility not in ('PUBLIC','PRIVATE') then raise exception 'Invalid profile visibility'; end if;
 update public.profiles set full_name=v_name,bio=v_bio,phone=v_phone,suburb=nullif(trim(p_suburb),''),city=nullif(trim(p_city),''),state=nullif(trim(p_state),''),updated_at=now() where id=v_uid;
 if not found then raise exception 'Profile not found'; end if;
 insert into public.public_profiles(id,display_name,avatar_url,bio,visibility,updated_at)
 select id,full_name,avatar_url,bio,p_visibility,now() from public.profiles where id=v_uid
 on conflict(id) do update set display_name=excluded.display_name,avatar_url=excluded.avatar_url,bio=excluded.bio,visibility=excluded.visibility,updated_at=now();
 return true;
end;$$;

create or replace function public.get_my_notification_preferences() returns jsonb language plpgsql stable security definer set search_path to public as $$
declare v_uid uuid:=auth.uid();v_row public.user_notification_preferences;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select * into v_row from public.user_notification_preferences where user_id=v_uid;
 if not found then return jsonb_build_object('quote_updates',true,'booking_updates',true,'message_updates',true,'order_updates',true,'delivery_updates',true,'business_opportunities',true,'marketing_updates',false); end if;
 return to_jsonb(v_row)-'user_id'-'updated_at';
end;$$;

create or replace function public.set_my_notification_preferences(p_quote_updates boolean,p_booking_updates boolean,p_message_updates boolean,p_order_updates boolean,p_delivery_updates boolean,p_business_opportunities boolean,p_marketing_updates boolean) returns boolean language plpgsql security definer set search_path to public as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 insert into public.user_notification_preferences(user_id,quote_updates,booking_updates,message_updates,order_updates,delivery_updates,business_opportunities,marketing_updates,updated_at)
 values(v_uid,p_quote_updates,p_booking_updates,p_message_updates,p_order_updates,p_delivery_updates,p_business_opportunities,p_marketing_updates,now())
 on conflict(user_id) do update set quote_updates=excluded.quote_updates,booking_updates=excluded.booking_updates,message_updates=excluded.message_updates,order_updates=excluded.order_updates,delivery_updates=excluded.delivery_updates,business_opportunities=excluded.business_opportunities,marketing_updates=excluded.marketing_updates,updated_at=now();
 return true;
end;$$;

revoke all on function public.update_my_profile_settings(text,text,text,text,text,text,text) from public,anon;
revoke all on function public.get_my_notification_preferences() from public,anon;
revoke all on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.update_my_profile_settings(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
