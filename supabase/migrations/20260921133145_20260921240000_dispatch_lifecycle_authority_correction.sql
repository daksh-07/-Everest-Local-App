-- Dispatch lifecycle authority correction.
-- Keeps marketplace authority and Phase 1 driver availability/verification authoritative.

alter table public.service_provider_capabilities
  drop constraint if exists service_provider_capabilities_provider_id_fkey;
alter table public.service_provider_locations
  drop constraint if exists service_provider_locations_provider_id_fkey;
alter table public.service_dispatch_offers
  drop constraint if exists service_dispatch_offers_provider_id_fkey;
alter table public.service_dispatch_assignments
  drop constraint if exists service_dispatch_assignments_provider_id_fkey;

alter table public.service_provider_capabilities
  add constraint service_provider_capabilities_provider_id_fkey
  foreign key(provider_id) references auth.users(id) on delete cascade;
alter table public.service_provider_locations
  add constraint service_provider_locations_provider_id_fkey
  foreign key(provider_id) references auth.users(id) on delete cascade;
alter table public.service_dispatch_offers
  add constraint service_dispatch_offers_provider_id_fkey
  foreign key(provider_id) references auth.users(id) on delete cascade;
alter table public.service_dispatch_assignments
  add constraint service_dispatch_assignments_provider_id_fkey
  foreign key(provider_id) references auth.users(id) on delete cascade;

drop table if exists public.service_provider_profiles cascade;

create table if not exists public.service_dispatch_provider_config(
  provider_id uuid primary key references auth.users(id) on delete cascade,
  travel_speed_kmh numeric(5,2) not null default 35
    check(travel_speed_kmh between 5 and 120),
  updated_at timestamptz not null default now()
);
alter table public.service_dispatch_provider_config enable row level security;
revoke all on public.service_dispatch_provider_config from anon,authenticated;
grant select on public.service_dispatch_provider_config to service_role;

alter table public.bookings
  add constraint bookings_id_request_id_key unique(id,request_id);

alter table public.service_dispatch_assignments
  add column if not exists service_request_id uuid,
  add column if not exists booking_id uuid;

update public.service_dispatch_assignments a
set service_request_id=j.request_id, booking_id=b.id
from public.service_dispatch_jobs j
join public.bookings b on b.request_id=j.request_id
where a.job_id=j.id and a.service_request_id is null;

alter table public.service_dispatch_assignments
  alter column service_request_id set not null,
  alter column booking_id set not null;

alter table public.service_dispatch_assignments
  add constraint service_dispatch_assignments_job_request_fk
    foreign key(job_id,service_request_id)
    references public.service_dispatch_jobs(id,request_id) on delete cascade,
  add constraint service_dispatch_assignments_booking_request_fk
    foreign key(booking_id,service_request_id)
    references public.bookings(id,request_id);

create index if not exists service_dispatch_assignments_request_idx
  on public.service_dispatch_assignments(service_request_id);
create index if not exists service_dispatch_assignments_booking_idx
  on public.service_dispatch_assignments(booking_id);

create or replace function public.guard_delivery_assignment_provider_conflict()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if NEW.accepted_at is not null and NEW.completed_at is null then
    perform pg_advisory_xact_lock(hashtextextended(NEW.driver_id::text,0));
    if exists(select 1 from public.service_dispatch_assignments
      where provider_id=NEW.driver_id and completed_at is null)
    then raise exception 'PROVIDER_HAS_INCOMPATIBLE_ACTIVE_ASSIGNMENT'; end if;
  end if;
  return NEW;
end $$;

create or replace function public.guard_service_dispatch_provider_conflict()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if NEW.completed_at is null then
    perform pg_advisory_xact_lock(hashtextextended(NEW.provider_id::text,0));
    if exists(select 1 from public.delivery_assignments
      where driver_id=NEW.provider_id and accepted_at is not null and completed_at is null)
    then raise exception 'PROVIDER_HAS_INCOMPATIBLE_ACTIVE_ASSIGNMENT'; end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_delivery_assignment_cross_domain_guard on public.delivery_assignments;
create trigger trg_delivery_assignment_cross_domain_guard
before insert or update of driver_id,accepted_at,completed_at
on public.delivery_assignments for each row
execute function public.guard_delivery_assignment_provider_conflict();

drop trigger if exists trg_service_dispatch_assignment_cross_domain_guard on public.service_dispatch_assignments;
create trigger trg_service_dispatch_assignment_cross_domain_guard
before insert or update of provider_id,completed_at
on public.service_dispatch_assignments for each row
execute function public.guard_service_dispatch_provider_conflict();

create or replace function public.dispatch_driver_is_operational(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare a public.driver_applications; result jsonb;
begin
  select * into a from public.driver_applications where user_id=p_user_id;
  if a.id is null or a.status<>'APPROVED' then return false; end if;
  result:=public.evaluate_driver_compliance(a.id);
  return coalesce(result->'overall'->>'status'='APPROVED',false)
    and jsonb_array_length(result->'overall'->'blockingItems')=0;
end $$;

create or replace function public.dispatch_eta_proxy_seconds(
  p_from_lat numeric,p_from_lon numeric,p_to_lat numeric,p_to_lon numeric,p_speed_kmh numeric
) returns integer language sql immutable strict security definer set search_path to 'public' as $$
select ceil((6371.0088*2*asin(sqrt(
  power(sin(radians(p_to_lat-p_from_lat)/2),2)+
  cos(radians(p_from_lat))*cos(radians(p_to_lat))*
  power(sin(radians(p_to_lon-p_from_lon)/2),2)
)))/greatest(p_speed_kmh,5)*3600)::integer
$$;

drop function if exists public.start_service_dispatch(uuid);
create or replace function public.start_service_dispatch(p_request_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r public.service_requests; b public.bookings; q public.quotes; j public.service_dispatch_jobs;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into r from public.service_requests where id=p_request_id for update;
  if r.id is null then raise exception 'DISPATCH_NOT_DISPATCHABLE:REQUEST_NOT_FOUND'; end if;
  if r.customer_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  if r.status<>'BOOKED' then raise exception 'DISPATCH_NOT_DISPATCHABLE:REQUEST_NOT_BOOKED'; end if;
  select * into b from public.bookings where request_id=r.id order by created_at desc limit 1 for update;
  if b.id is null then raise exception 'DISPATCH_NOT_DISPATCHABLE:BOOKING_NOT_FOUND'; end if;
  if b.request_id<>r.id then raise exception 'DISPATCH_NOT_DISPATCHABLE:BOOKING_REQUEST_MISMATCH'; end if;
  if b.status<>'CONFIRMED' then raise exception 'DISPATCH_NOT_DISPATCHABLE:BOOKING_NOT_CONFIRMED'; end if;
  if b.quote_id is null then raise exception 'DISPATCH_NOT_DISPATCHABLE:BOOKING_QUOTE_MISSING'; end if;
  select * into q from public.quotes where id=b.quote_id for update;
  if q.id is null then raise exception 'DISPATCH_NOT_DISPATCHABLE:QUOTE_NOT_FOUND'; end if;
  if q.status<>'ACCEPTED' then raise exception 'DISPATCH_NOT_DISPATCHABLE:QUOTE_NOT_ACCEPTED'; end if;
  if q.request_id<>r.id then raise exception 'DISPATCH_NOT_DISPATCHABLE:QUOTE_REQUEST_MISMATCH'; end if;
  if r.delivery_mode<>'LOCAL' then raise exception 'DISPATCH_NOT_DISPATCHABLE:LOCAL_LOCATION_REQUIRED'; end if;
  if r.latitude is null or r.longitude is null then raise exception 'DISPATCH_NOT_DISPATCHABLE:LOCATION_UNAVAILABLE'; end if;
  if r.service_id is null then raise exception 'DISPATCH_NOT_DISPATCHABLE:SERVICE_CAPABILITY_UNRESOLVED'; end if;
  select * into j from public.service_dispatch_jobs where request_id=r.id for update;
  if j.id is not null then return j.id; end if;
  insert into public.service_dispatch_jobs(request_id,status,scheduled_start_at)
  values(r.id,'SEARCHING',
    case when b.scheduled_date is not null
      then (b.scheduled_date+coalesce(b.scheduled_time,time '00:00')) at time zone 'Australia/Sydney'
      else null end)
  returning * into j;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'SERVICE_DISPATCH_CREATED','SERVICE_DISPATCH_JOB',j.id,
         jsonb_build_object('request_id',r.id,'booking_id',b.id,'quote_id',q.id)),
        (auth.uid(),'SERVICE_DISPATCH_STARTED','SERVICE_DISPATCH_JOB',j.id,
         jsonb_build_object('request_id',r.id,'booking_id',b.id));
  perform public.dispatch_next_service_provider(j.id);
  return j.id;
end $$;

drop function if exists public.get_service_dispatch_candidates(uuid,integer);
create or replace function public.get_service_dispatch_candidates(p_job_id uuid,p_limit integer default 25)
returns table(provider_id uuid,business_id uuid,eta_seconds integer,location_age_seconds integer,compatibility_score integer,expected_job_value numeric,estimated_duration_minutes integer)
language sql security definer set search_path to 'public' as $$
with j as(
  select r.* from public.service_dispatch_jobs d
  join public.service_requests r on r.id=d.request_id where d.id=p_job_id
),cfg as(select * from public.service_dispatch_config where id=true)
select cap.provider_id,s.business_id,
  public.dispatch_eta_proxy_seconds(j.latitude,j.longitude,l.latitude,l.longitude,
    coalesce(pc.travel_speed_kmh,cfg.default_travel_speed_kmh)),
  greatest(0,extract(epoch from(now()-l.recorded_at)))::integer,
  100,s.base_price,s.duration_minutes
from j
join public.service_provider_capabilities cap on cap.service_id=j.service_id
join public.services s on s.id=cap.service_id and s.active
join public.driver_availability da on da.driver_id=cap.provider_id and da.status='ONLINE'
join public.service_provider_locations l on l.provider_id=cap.provider_id
left join public.service_dispatch_provider_config pc on pc.provider_id=cap.provider_id
cross join cfg
where j.latitude is not null and j.longitude is not null
  and l.recorded_at>=now()-make_interval(secs=>cfg.location_freshness_seconds)
  and public.dispatch_driver_is_operational(cap.provider_id)
  and (6371.0088*2*asin(sqrt(
    power(sin(radians(l.latitude-j.latitude)/2),2)+
    cos(radians(j.latitude))*cos(radians(l.latitude))*
    power(sin(radians(l.longitude-j.longitude)/2),2)
  )))<=da.service_radius_km
  and not exists(select 1 from public.service_dispatch_offers o
    where o.job_id=p_job_id and o.provider_id=cap.provider_id)
  and not exists(select 1 from public.service_dispatch_assignments a
    where a.provider_id=cap.provider_id and a.completed_at is null)
  and not exists(select 1 from public.delivery_assignments a
    where a.driver_id=cap.provider_id and a.accepted_at is not null and a.completed_at is null)
order by 3,4,5,1 limit greatest(1,least(p_limit,25))
$$;

create or replace function public.dispatch_next_service_provider(p_job_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare j public.service_dispatch_jobs; r public.service_requests; cfg public.service_dispatch_config; c record; oid uuid;
begin
  select * into j from public.service_dispatch_jobs where id=p_job_id for update;
  if j.id is null or j.status<>'SEARCHING' then return null; end if;
  select * into r from public.service_requests where id=j.request_id;
  select * into cfg from public.service_dispatch_config where id=true;
  select c.* into c from public.get_service_dispatch_candidates(p_job_id,25) c
  order by c.eta_seconds,c.location_age_seconds,c.compatibility_score,c.provider_id limit 1;
  if c.provider_id is null then
    update public.service_dispatch_jobs set status='EXHAUSTED',updated_at=now()
      where id=j.id and status='SEARCHING';
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'SERVICE_DISPATCH_EXHAUSTED','SERVICE_DISPATCH_JOB',j.id,'{}'::jsonb);
    return null;
  end if;
  insert into public.service_dispatch_offers(
    job_id,provider_id,expires_at,eta_seconds,location_age_seconds,compatibility_score,
    expected_job_value,estimated_duration_minutes)
  values(j.id,c.provider_id,now()+make_interval(secs=>cfg.offer_timeout_seconds),
    c.eta_seconds,c.location_age_seconds,c.compatibility_score,c.expected_job_value,c.estimated_duration_minutes)
  returning id into oid;
  update public.service_dispatch_jobs set status='PROVIDER_OFFERED',
    estimated_duration_minutes=coalesce(j.estimated_duration_minutes,c.estimated_duration_minutes),
    updated_at=now() where id=j.id and status='SEARCHING';
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'SERVICE_DISPATCH_PROVIDER_CONSIDERED','SERVICE_DISPATCH_JOB',j.id,
    jsonb_build_object('provider_id',c.provider_id,'eta_proxy_seconds',c.eta_seconds,
      'location_age_seconds',c.location_age_seconds)),
    (auth.uid(),'SERVICE_DISPATCH_OFFER_CREATED','SERVICE_DISPATCH_OFFER',oid,
    jsonb_build_object('job_id',j.id,'provider_id',c.provider_id,'eta_proxy_method','GEOGRAPHIC_PROXY'));
  return oid;
end $$;

drop function if exists public.respond_service_dispatch_offer(uuid,text);
create or replace function public.respond_service_dispatch_offer(p_offer_id uuid,p_response text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare o public.service_dispatch_offers; j public.service_dispatch_jobs; r public.service_requests;
  b public.bookings; q public.quotes; loc public.service_provider_locations; av public.driver_availability;
  fresh integer; aid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if upper(trim(p_response)) not in('ACCEPT','DECLINE') then raise exception 'INVALID_OFFER_RESPONSE'; end if;
  select * into o from public.service_dispatch_offers where id=p_offer_id for update;
  if o.id is null or o.provider_id<>auth.uid() then raise exception 'Not authorized'; end if;
  select * into j from public.service_dispatch_jobs where id=o.job_id for update;
  if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if j.status='ASSIGNED' or j.claimed_provider_id is not null then
    return jsonb_build_object('ok',false,'code','JOB_ALREADY_ASSIGNED');
  end if;
  if j.status<>'PROVIDER_OFFERED' or o.status<>'OFFERED' then
    return jsonb_build_object('ok',false,'code','OFFER_NO_LONGER_AVAILABLE');
  end if;
  if o.expires_at<=now() then
    update public.service_dispatch_offers set status='EXPIRED',responded_at=now() where id=o.id and status='OFFERED';
    update public.service_dispatch_jobs set status='SEARCHING',updated_at=now()
      where id=j.id and status='PROVIDER_OFFERED';
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'SERVICE_DISPATCH_OFFER_EXPIRED','SERVICE_DISPATCH_OFFER',o.id,jsonb_build_object('job_id',j.id));
    perform public.dispatch_next_service_provider(j.id);
    return jsonb_build_object('ok',false,'code','OFFER_NO_LONGER_AVAILABLE');
  end if;
  if upper(trim(p_response))='DECLINE' then
    update public.service_dispatch_offers set status='DECLINED',responded_at=now() where id=o.id and status='OFFERED';
    update public.service_dispatch_jobs set status='SEARCHING',updated_at=now()
      where id=j.id and status='PROVIDER_OFFERED';
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'SERVICE_DISPATCH_OFFER_DECLINED','SERVICE_DISPATCH_OFFER',o.id,jsonb_build_object('job_id',j.id));
    perform public.dispatch_next_service_provider(j.id);
    return jsonb_build_object('ok',true,'code','DECLINED');
  end if;

  if not public.dispatch_driver_is_operational(auth.uid()) then
    return jsonb_build_object('ok',false,'code','PROVIDER_NOT_OPERATIONAL');
  end if;
  select * into av from public.driver_availability where driver_id=auth.uid();
  if av.status<>'ONLINE' then return jsonb_build_object('ok',false,'code','PROVIDER_NOT_ONLINE'); end if;
  select * into loc from public.service_provider_locations where provider_id=auth.uid();
  if loc.provider_id is null then return jsonb_build_object('ok',false,'code','LOCATION_UNAVAILABLE'); end if;
  select greatest(0,extract(epoch from(now()-loc.recorded_at)))::integer into fresh;
  if fresh>(select location_freshness_seconds from public.service_dispatch_config where id=true)
    then return jsonb_build_object('ok',false,'code','LOCATION_STALE'); end if;

  select * into r from public.service_requests where id=j.request_id for update;
  select * into b from public.bookings where request_id=r.id order by created_at desc limit 1 for update;
  if r.status<>'BOOKED' or b.status<>'CONFIRMED' or b.quote_id is null
    then return jsonb_build_object('ok',false,'code','JOB_NO_LONGER_DISPATCHABLE'); end if;
  select * into q from public.quotes where id=b.quote_id;
  if q.id is null or q.status<>'ACCEPTED' or q.request_id<>r.id
    then return jsonb_build_object('ok',false,'code','JOB_NO_LONGER_DISPATCHABLE'); end if;
  if not exists(select 1 from public.service_provider_capabilities
    where provider_id=auth.uid() and service_id=r.service_id)
    then return jsonb_build_object('ok',false,'code','PROVIDER_NOT_CAPABLE'); end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if exists(select 1 from public.delivery_assignments
      where driver_id=auth.uid() and accepted_at is not null and completed_at is null)
     or exists(select 1 from public.service_dispatch_assignments
      where provider_id=auth.uid() and completed_at is null)
  then return jsonb_build_object('ok',false,'code','PROVIDER_HAS_INCOMPATIBLE_ACTIVE_ASSIGNMENT'); end if;

  insert into public.service_dispatch_assignments(
    job_id,service_request_id,booking_id,provider_id,scheduled_start_at,scheduled_end_at)
  values(j.id,r.id,b.id,auth.uid(),j.scheduled_start_at,
    case when j.scheduled_start_at is null or j.estimated_duration_minutes is null then null
      else j.scheduled_start_at+make_interval(mins=>j.estimated_duration_minutes) end)
  returning id into aid;

  update public.service_dispatch_offers set status='ACCEPTED',responded_at=now()
    where id=o.id and status='OFFERED';
  update public.service_dispatch_jobs set status='ASSIGNED',
    claimed_provider_id=auth.uid(),claimed_at=now(),updated_at=now()
    where id=j.id and status='PROVIDER_OFFERED';
  if not found then raise exception 'JOB_ALREADY_ASSIGNED'; end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'SERVICE_DISPATCH_OFFER_ACCEPTED','SERVICE_DISPATCH_OFFER',o.id,
    jsonb_build_object('job_id',j.id)),
    (auth.uid(),'SERVICE_DISPATCH_ASSIGNMENT_CREATED','SERVICE_DISPATCH_ASSIGNMENT',aid,
    jsonb_build_object('job_id',j.id,'request_id',r.id,'booking_id',b.id,'provider_id',auth.uid()));
  return jsonb_build_object('ok',true,'code','ASSIGNED','job_id',j.id,'assignment_id',aid);
exception when unique_violation then
  return jsonb_build_object('ok',false,'code','JOB_ALREADY_ASSIGNED');
end $$;

create or replace function public.process_service_dispatch_queue()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare x record; n integer:=0;
begin
  for x in select o.id,j.id job_id from public.service_dispatch_offers o
    join public.service_dispatch_jobs j on j.id=o.job_id
    where o.status='OFFERED' and o.expires_at<=now() and j.status='PROVIDER_OFFERED'
    for update of o,j
  loop
    update public.service_dispatch_offers set status='EXPIRED',responded_at=now()
      where id=x.id and status='OFFERED';
    update public.service_dispatch_jobs set status='SEARCHING',updated_at=now()
      where id=x.job_id and status='PROVIDER_OFFERED';
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(null,'SERVICE_DISPATCH_OFFER_EXPIRED','SERVICE_DISPATCH_OFFER',x.id,jsonb_build_object('job_id',x.job_id));
    perform public.dispatch_next_service_provider(x.job_id);
    n:=n+1;
  end loop;
  return n;
end $$;

create or replace function public.update_provider_location(
  p_latitude numeric,p_longitude numeric,p_accuracy_m numeric default null,p_recorded_at timestamptz default now()
) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare uid uuid:=auth.uid(); min_interval integer; last_recorded timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.dispatch_driver_is_operational(uid) then raise exception 'DRIVER_NOT_OPERATIONAL'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'INVALID_LOCATION'; end if;
  if p_accuracy_m is not null and p_accuracy_m<0 then raise exception 'INVALID_ACCURACY'; end if;
  select min_location_update_seconds into min_interval from public.service_dispatch_config where id=true;
  select recorded_at into last_recorded from public.service_provider_locations where provider_id=uid for update;
  if last_recorded is not null and p_recorded_at<last_recorded then raise exception 'STALE_LOCATION_UPDATE'; end if;
  if last_recorded is not null and extract(epoch from(p_recorded_at-last_recorded))<min_interval
    then raise exception 'LOCATION_UPDATE_TOO_FREQUENT'; end if;
  insert into public.service_provider_locations(provider_id,latitude,longitude,accuracy_m,recorded_at,updated_at)
  values(uid,p_latitude,p_longitude,p_accuracy_m,p_recorded_at,now())
  on conflict(provider_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,
    accuracy_m=excluded.accuracy_m,recorded_at=excluded.recorded_at,updated_at=now();
  return true;
end $$;

revoke all on function public.dispatch_driver_is_operational(uuid) from public,anon,authenticated;
revoke all on function public.dispatch_eta_proxy_seconds(numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.dispatch_next_service_provider(uuid) from public,anon,authenticated;
revoke all on function public.get_service_dispatch_candidates(uuid,integer) from public,anon,authenticated;
revoke all on function public.process_service_dispatch_queue() from public,anon,authenticated;
grant execute on function public.start_service_dispatch(uuid) to authenticated;
grant execute on function public.respond_service_dispatch_offer(uuid,text) to authenticated;
grant execute on function public.update_provider_location(numeric,numeric,numeric,timestamptz) to authenticated;
grant execute on function public.dispatch_next_service_provider(uuid) to service_role;
grant execute on function public.get_service_dispatch_candidates(uuid,integer) to service_role;
grant execute on function public.process_service_dispatch_queue() to service_role;

alter table public.service_provider_capabilities enable row level security;
alter table public.service_provider_locations enable row level security;
alter table public.service_dispatch_jobs enable row level security;
alter table public.service_dispatch_offers enable row level security;
alter table public.service_dispatch_assignments enable row level security;

drop policy if exists service_provider_capabilities_self on public.service_provider_capabilities;
create policy service_provider_capabilities_self on public.service_provider_capabilities
for select to authenticated using(provider_id=(select auth.uid()));
drop policy if exists service_provider_locations_self on public.service_provider_locations;
create policy service_provider_locations_self on public.service_provider_locations
for select to authenticated using(provider_id=(select auth.uid()));
drop policy if exists service_dispatch_jobs_customer_or_provider on public.service_dispatch_jobs;
create policy service_dispatch_jobs_customer_or_provider on public.service_dispatch_jobs
for select to authenticated using(
  exists(select 1 from public.service_requests r where r.id=request_id and r.customer_id=(select auth.uid()))
  or claimed_provider_id=(select auth.uid())
);
drop policy if exists service_dispatch_offers_provider on public.service_dispatch_offers;
create policy service_dispatch_offers_provider on public.service_dispatch_offers
for select to authenticated using(provider_id=(select auth.uid()));
drop policy if exists service_dispatch_assignments_provider on public.service_dispatch_assignments;
create policy service_dispatch_assignments_provider on public.service_dispatch_assignments
for select to authenticated using(provider_id=(select auth.uid()));
