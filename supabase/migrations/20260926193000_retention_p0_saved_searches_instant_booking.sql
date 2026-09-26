-- Retention P0: saved intent, controlled availability and atomic instant bookings.
-- All customer-visible prices, capacity and slot checks remain database-authoritative.

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  vertical text not null default 'ALL' check (vertical in ('ALL','BUSINESS','SERVICE','PRODUCT','DEAL','POST')),
  query text not null default '' check (length(query) <= 240),
  structured_filters jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_filters)='object'),
  suburb text,
  city text,
  state text,
  latitude numeric,
  longitude numeric,
  radius_km numeric check (radius_km is null or radius_km between 1 and 100),
  notifications_enabled boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_searches_user_updated_idx on public.saved_searches(user_id,updated_at desc);
create index if not exists saved_searches_alert_idx on public.saved_searches(notifications_enabled,vertical) where notifications_enabled;

create table if not exists public.saved_search_matches (
  id uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  matched_entity_type text not null check (matched_entity_type in ('BUSINESS','SERVICE','PRODUCT','DEAL','POST','AVAILABLE_SLOT')),
  matched_entity_id uuid not null,
  match_context jsonb not null default '{}'::jsonb check (jsonb_typeof(match_context)='object'),
  first_matched_at timestamptz not null default now(),
  notified_at timestamptz,
  unique(saved_search_id,matched_entity_type,matched_entity_id)
);
create index if not exists saved_search_matches_search_time_idx on public.saved_search_matches(saved_search_id,first_matched_at desc);

alter table public.saved_searches enable row level security;
alter table public.saved_search_matches enable row level security;
revoke all on public.saved_searches,public.saved_search_matches from public,anon;
revoke all on public.saved_search_matches from authenticated;
grant select,insert,update,delete on public.saved_searches to authenticated;
grant select on public.saved_search_matches to authenticated;
drop policy if exists saved_searches_owner_all on public.saved_searches;
create policy saved_searches_owner_all on public.saved_searches for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists saved_search_matches_owner_read on public.saved_search_matches;
create policy saved_search_matches_owner_read on public.saved_search_matches for select to authenticated
using (exists(select 1 from public.saved_searches s where s.id=saved_search_id and s.user_id=(select auth.uid())));

create or replace function public.retention_touch_updated_at()
returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists saved_searches_touch on public.saved_searches;
create trigger saved_searches_touch before update on public.saved_searches for each row execute function public.retention_touch_updated_at();

-- This is intentionally not granted to app roles. Trusted triggers/workers may create
-- in-app saved-search alerts, while customers can only read their own resulting records.
create or replace function public.record_saved_search_match(
  p_entity_type text,p_entity_id uuid,p_title text,p_searchable_text text default '',
  p_suburb text default null,p_city text default null,p_state text default null,
  p_amount numeric default null,p_available_now boolean default false
) returns integer language plpgsql security definer set search_path='' as $$
declare s record; inserted_count integer:=0; mid uuid;
begin
  if p_entity_id is null or p_entity_type not in ('BUSINESS','SERVICE','PRODUCT','DEAL','POST','AVAILABLE_SLOT') then return 0; end if;
  for s in select * from public.saved_searches where notifications_enabled loop
    if s.vertical<>'ALL' and s.vertical<>p_entity_type and not (s.vertical='SERVICE' and p_entity_type='AVAILABLE_SLOT') then continue; end if;
    if nullif(trim(s.query),'') is not null and coalesce(p_title,'') not ilike '%'||trim(s.query)||'%' and coalesce(p_searchable_text,'') not ilike '%'||trim(s.query)||'%' then continue; end if;
    if s.suburb is not null and lower(coalesce(p_suburb,''))<>lower(s.suburb) then continue; end if;
    if s.city is not null and lower(coalesce(p_city,''))<>lower(s.city) then continue; end if;
    if s.state is not null and lower(coalesce(p_state,''))<>lower(s.state) then continue; end if;
    if coalesce((s.structured_filters->>'available_now')::boolean,false) and not p_available_now then continue; end if;
    if s.structured_filters ? 'max_price' and (p_amount is null or p_amount>(s.structured_filters->>'max_price')::numeric) then continue; end if;
    insert into public.saved_search_matches(saved_search_id,matched_entity_type,matched_entity_id,match_context)
    values(s.id,p_entity_type,p_entity_id,jsonb_build_object('title',left(coalesce(p_title,''),240),'amount',p_amount,'available_now',p_available_now))
    on conflict(saved_search_id,matched_entity_type,matched_entity_id) do nothing returning id into mid;
    if mid is not null then
      inserted_count:=inserted_count+1;
      insert into public.notifications(user_id,kind,title,body,data)
      values(s.user_id,'SAVED_SEARCH_MATCH','New saved-search match',left(coalesce(p_title,'A new local result')||' matches “'||s.name||'”.',500),jsonb_build_object('saved_search_id',s.id,'match_id',mid,'entity_type',p_entity_type,'entity_id',p_entity_id))
      on conflict do nothing;
      update public.saved_search_matches set notified_at=now() where id=mid;
      update public.saved_searches set last_notified_at=now() where id=s.id;
    end if;
  end loop;
  return inserted_count;
end $$;
revoke all on function public.record_saved_search_match(text,uuid,text,text,text,text,text,numeric,boolean) from public,anon,authenticated;

create or replace function public.retention_product_saved_search_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.businesses;
begin
  if new.status='ACTIVE' then
    select * into b from public.businesses where id=new.business_id and status='ACTIVE' and verification_status='VERIFIED';
    if b.id is not null then perform public.record_saved_search_match('PRODUCT',new.id,new.name,coalesce(new.description,''),b.suburb,b.city,b.state,coalesce(new.sale_price,new.price),false); end if;
  end if;
  return new;
end $$;
drop trigger if exists products_saved_search_match on public.products;
create trigger products_saved_search_match after insert or update of status,price,sale_price,name,description on public.products for each row execute function public.retention_product_saved_search_trigger();

create or replace function public.retention_available_now_saved_search_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.businesses;
begin
  if new.status='AVAILABLE_NOW' and (tg_op='INSERT' or old.status is distinct from new.status) and (new.available_until is null or new.available_until>now()) then
    select * into b from public.businesses where id=new.business_id and status='ACTIVE' and verification_status='VERIFIED';
    if b.id is not null then perform public.record_saved_search_match('AVAILABLE_SLOT',b.id,b.name,coalesce(b.description,''),b.suburb,b.city,b.state,null,true); end if;
  end if;
  return new;
end $$;
drop trigger if exists business_availability_saved_search_match on public.business_availability;
create trigger business_availability_saved_search_match after insert or update of status,available_until on public.business_availability for each row execute function public.retention_available_now_saved_search_trigger();

create table if not exists public.business_booking_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  timezone text not null default 'Australia/Sydney' check (length(timezone) between 1 and 80),
  weekly_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(weekly_hours)='object'),
  buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 240),
  capacity integer not null default 1 check (capacity between 1 and 100),
  minimum_advance_minutes integer not null default 60 check (minimum_advance_minutes between 0 and 10080),
  maximum_booking_days integer not null default 60 check (maximum_booking_days between 1 and 365),
  same_day_enabled boolean not null default true,
  instant_booking_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.service_booking_settings (
  service_id uuid primary key references public.services(id) on delete cascade,
  instant_booking_enabled boolean not null default false,
  recurring_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.instant_booking_slots (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at>starts_at)
);
create index if not exists instant_booking_slots_business_range_idx on public.instant_booking_slots using gist (business_id,tstzrange(starts_at,ends_at,'[)'));

create table if not exists public.booking_series (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  frequency text not null check (frequency in ('WEEKLY','FORTNIGHTLY','MONTHLY')),
  preferred_weekday integer check (preferred_weekday between 1 and 7),
  preferred_time time not null,
  active boolean not null default true,
  next_occurrence_at timestamptz not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists booking_series_customer_next_idx on public.booking_series(customer_id,active,next_occurrence_at);
create unique index if not exists booking_series_active_dedupe_idx on public.booking_series(customer_id,business_id,service_id,frequency,preferred_time) where active;

alter table public.business_booking_settings enable row level security;
alter table public.service_booking_settings enable row level security;
alter table public.instant_booking_slots enable row level security;
alter table public.booking_series enable row level security;
revoke all on public.business_booking_settings,public.service_booking_settings,public.instant_booking_slots,public.booking_series from public,anon;
revoke all on public.instant_booking_slots from authenticated;
grant select on public.business_booking_settings,public.service_booking_settings to authenticated;
grant select,insert,update on public.booking_series to authenticated;
drop policy if exists business_booking_settings_read on public.business_booking_settings;
create policy business_booking_settings_read on public.business_booking_settings for select to authenticated using (true);
drop policy if exists service_booking_settings_read on public.service_booking_settings;
create policy service_booking_settings_read on public.service_booking_settings for select to authenticated using (true);
drop policy if exists booking_series_customer_all on public.booking_series;
create policy booking_series_customer_all on public.booking_series for all to authenticated using ((select auth.uid())=customer_id) with check ((select auth.uid())=customer_id);

create or replace function public.set_business_booking_settings(
  p_business_id uuid,p_timezone text,p_weekly_hours jsonb,p_buffer_minutes integer,p_capacity integer,
  p_minimum_advance_minutes integer,p_maximum_booking_days integer,p_same_day_enabled boolean,p_instant_booking_enabled boolean
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(coalesce(p_weekly_hours,'{}'::jsonb))<>'object' then raise exception 'Weekly hours must be an object'; end if;
  if p_buffer_minutes not between 0 and 240 or p_capacity not between 1 and 100 or p_minimum_advance_minutes not between 0 and 10080 or p_maximum_booking_days not between 1 and 365 then raise exception 'Invalid booking settings'; end if;
  if p_instant_booking_enabled and p_weekly_hours='{}'::jsonb then raise exception 'Set working hours before enabling instant booking'; end if;
  insert into public.business_booking_settings(business_id,timezone,weekly_hours,buffer_minutes,capacity,minimum_advance_minutes,maximum_booking_days,same_day_enabled,instant_booking_enabled,updated_by,updated_at)
  values(p_business_id,coalesce(nullif(trim(p_timezone),''),'Australia/Sydney'),coalesce(p_weekly_hours,'{}'::jsonb),p_buffer_minutes,p_capacity,p_minimum_advance_minutes,p_maximum_booking_days,p_same_day_enabled,p_instant_booking_enabled,auth.uid(),now())
  on conflict(business_id) do update set timezone=excluded.timezone,weekly_hours=excluded.weekly_hours,buffer_minutes=excluded.buffer_minutes,capacity=excluded.capacity,minimum_advance_minutes=excluded.minimum_advance_minutes,maximum_booking_days=excluded.maximum_booking_days,same_day_enabled=excluded.same_day_enabled,instant_booking_enabled=excluded.instant_booking_enabled,updated_by=auth.uid(),updated_at=now();
  return true;
end $$;
revoke all on function public.set_business_booking_settings(uuid,text,jsonb,integer,integer,integer,integer,boolean,boolean) from public,anon;
grant execute on function public.set_business_booking_settings(uuid,text,jsonb,integer,integer,integer,integer,boolean,boolean) to authenticated;

create or replace function public.set_service_booking_settings(p_service_id uuid,p_instant_booking_enabled boolean,p_recurring_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
  select business_id into bid from public.services where id=p_service_id for update;
  if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
  insert into public.service_booking_settings(service_id,instant_booking_enabled,recurring_enabled,updated_by,updated_at)
  values(p_service_id,p_instant_booking_enabled,p_recurring_enabled,auth.uid(),now())
  on conflict(service_id) do update set instant_booking_enabled=excluded.instant_booking_enabled,recurring_enabled=excluded.recurring_enabled,updated_by=auth.uid(),updated_at=now();
  return true;
end $$;
revoke all on function public.set_service_booking_settings(uuid,boolean,boolean) from public,anon;
grant execute on function public.set_service_booking_settings(uuid,boolean,boolean) to authenticated;

create or replace function public.get_instant_booking_slots(p_service_id uuid,p_from timestamptz default now(),p_days integer default 14)
returns table(starts_at timestamptz,ends_at timestamptz) language sql security definer set search_path='' as $$
  with config as (
    select s.id service_id,s.business_id,coalesce(s.duration_minutes,60) duration_minutes,bset.timezone,bset.weekly_hours,bset.buffer_minutes,bset.capacity,bset.minimum_advance_minutes,bset.maximum_booking_days,bset.same_day_enabled
    from public.services s join public.businesses b on b.id=s.business_id
    join public.service_booking_settings ss on ss.service_id=s.id and ss.instant_booking_enabled
    join public.business_booking_settings bset on bset.business_id=s.business_id and bset.instant_booking_enabled
    left join public.business_availability ba on ba.business_id=s.business_id
    where s.id=p_service_id and s.active and b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests and (ba.status is null or ba.status<>'OFFLINE')
  ), candidates as (
    select c.*, slot as starts_at,slot+make_interval(mins=>c.duration_minutes+c.buffer_minutes) as ends_at
    from config c cross join lateral generate_series(date_trunc('hour',greatest(p_from,now())),'now'::timestamptz+make_interval(days=>least(greatest(p_days,1),c.maximum_booking_days)),interval '30 minutes') slot
    where slot>=now()+make_interval(mins=>c.minimum_advance_minutes)
      and (c.same_day_enabled or (slot at time zone c.timezone)::date>(now() at time zone c.timezone)::date)
      and exists(select 1 from jsonb_array_elements(coalesce(c.weekly_hours->to_char(slot at time zone c.timezone,'ID'),'[]'::jsonb)) w where (slot at time zone c.timezone)::time >= (w->>'start')::time and (slot+make_interval(mins=>c.duration_minutes+c.buffer_minutes) at time zone c.timezone)::time <= (w->>'end')::time)
  )
  select c.starts_at,c.ends_at from candidates c
  where not exists(select 1 from public.crm_calendar_blocks x where x.business_id=c.business_id and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(c.starts_at,c.ends_at,'[)'))
    and not exists(select 1 from public.external_calendar_busy_blocks x where x.business_id=c.business_id and x.status='BUSY' and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(c.starts_at,c.ends_at,'[)'))
    and (select count(*) from public.instant_booking_slots x join public.bookings b on b.id=x.booking_id where x.business_id=c.business_id and b.status not in ('CANCELLED','DISPUTED') and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(c.starts_at,c.ends_at,'[)')) < c.capacity
  order by c.starts_at limit 80;
$$;
revoke all on function public.get_instant_booking_slots(uuid,timestamptz,integer) from public,anon;
grant execute on function public.get_instant_booking_slots(uuid,timestamptz,integer) to authenticated;

create or replace function public.instant_book_service(p_service_id uuid,p_starts_at timestamptz,p_suburb text,p_city text,p_state text,p_notes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.services; b public.businesses; cfg public.business_booking_settings; ss public.service_booking_settings; ends_at timestamptz; rid uuid; qid uuid; bid uuid; active_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select svc.* into s from public.services svc where svc.id=p_service_id for update;
  if s.id is null or not s.active or s.base_price is null then raise exception 'This service is not available for instant booking'; end if;
  select * into b from public.businesses where id=s.business_id and status='ACTIVE' and verification_status='VERIFIED' and accepts_requests;
  select * into cfg from public.business_booking_settings where business_id=s.business_id for update;
  select * into ss from public.service_booking_settings where service_id=s.id;
  if b.id is null or not coalesce(cfg.instant_booking_enabled,false) or not coalesce(ss.instant_booking_enabled,false) then raise exception 'Instant booking is not enabled for this service'; end if;
  if p_starts_at<now()+make_interval(mins=>cfg.minimum_advance_minutes) or p_starts_at>now()+make_interval(days=>cfg.maximum_booking_days) or (not cfg.same_day_enabled and (p_starts_at at time zone cfg.timezone)::date=(now() at time zone cfg.timezone)::date) then raise exception 'This slot is no longer available'; end if;
  ends_at:=p_starts_at+make_interval(mins=>coalesce(s.duration_minutes,60)+cfg.buffer_minutes);
  if not exists(select 1 from jsonb_array_elements(coalesce(cfg.weekly_hours->to_char(p_starts_at at time zone cfg.timezone,'ID'),'[]'::jsonb)) w where (p_starts_at at time zone cfg.timezone)::time >= (w->>'start')::time and (ends_at at time zone cfg.timezone)::time <= (w->>'end')::time) then raise exception 'This slot is outside the business working hours'; end if;
  if exists(select 1 from public.crm_calendar_blocks x where x.business_id=s.business_id and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(p_starts_at,ends_at,'[)')) or exists(select 1 from public.external_calendar_busy_blocks x where x.business_id=s.business_id and x.status='BUSY' and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(p_starts_at,ends_at,'[)')) then raise exception 'This slot is no longer available'; end if;
  select count(*) into active_count from public.instant_booking_slots x join public.bookings bk on bk.id=x.booking_id where x.business_id=s.business_id and bk.status not in ('CANCELLED','DISPUTED') and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(p_starts_at,ends_at,'[)');
  if active_count>=cfg.capacity then raise exception 'This slot has just been taken'; end if;
  if nullif(trim(coalesce(p_suburb,'')),'') is null or nullif(trim(coalesce(p_city,'')),'') is null or nullif(trim(coalesce(p_state,'')),'') is null then raise exception 'A service location is required'; end if;
  if s.delivery_mode='LOCAL' and not exists(select 1 from public.service_areas a where a.business_id=s.business_id and a.active and lower(a.suburb)=lower(trim(p_suburb)) and lower(a.city)=lower(trim(p_city)) and lower(a.state)=lower(trim(p_state))) then raise exception 'This business does not service that location'; end if;
  insert into public.service_requests(customer_id,category_id,service_id,delivery_mode,description,suburb,city,state,preferred_date,preferred_time,budget,status)
  values(auth.uid(),s.category_id,s.id,s.delivery_mode,'Instant booking: '||s.name,nullif(trim(p_suburb),''),nullif(trim(p_city),''),nullif(trim(p_state),''),(p_starts_at at time zone cfg.timezone)::date,(p_starts_at at time zone cfg.timezone)::time,s.base_price,'BOOKED') returning id into rid;
  insert into public.quotes(request_id,business_id,customer_id,service_id,description,price,deposit,total,proposed_date,proposed_time,status)
  values(rid,s.business_id,auth.uid(),s.id,'Instant booking: '||s.name,s.base_price,0,s.base_price,(p_starts_at at time zone cfg.timezone)::date,(p_starts_at at time zone cfg.timezone)::time,'ACCEPTED') returning id into qid;
  insert into public.bookings(request_id,quote_id,customer_id,business_id,price,scheduled_date,scheduled_time,status)
  values(rid,qid,auth.uid(),s.business_id,s.base_price,(p_starts_at at time zone cfg.timezone)::date,(p_starts_at at time zone cfg.timezone)::time,'CONFIRMED') returning id into bid;
  insert into public.instant_booking_slots(booking_id,service_id,business_id,starts_at,ends_at) values(bid,s.id,s.business_id,p_starts_at,ends_at);
  insert into public.notifications(user_id,kind,title,body,data) values(b.owner_id,'INSTANT_BOOKING_CONFIRMED','Instant booking confirmed',s.name||' was booked instantly.',jsonb_build_object('booking_id',bid,'service_id',s.id));
  return bid;
end $$;
revoke all on function public.instant_book_service(uuid,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.instant_book_service(uuid,timestamptz,text,text,text,text) to authenticated;
