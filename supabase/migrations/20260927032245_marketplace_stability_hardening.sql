-- Reliability hardening for high-frequency marketplace use.
-- 1) idempotent service request creation
-- 2) idempotent Everest Live start/retry
-- 3) bounded Live radius expansion
-- 4) cheaper Live state aggregation
-- 5) index for the global Live mini-player

alter table public.service_requests
  add column if not exists request_idempotency_key text;

alter table public.service_requests
  drop constraint if exists service_requests_idempotency_key_length,
  add constraint service_requests_idempotency_key_length
    check(request_idempotency_key is null or length(request_idempotency_key) between 16 and 128);

create unique index if not exists service_requests_customer_idempotency_uidx
  on public.service_requests(customer_id,request_idempotency_key)
  where request_idempotency_key is not null;

create index if not exists service_requests_customer_live_recent_idx
  on public.service_requests(customer_id,live_started_at desc)
  where is_live and live_status in ('SEARCHING','NOTIFYING','RESPONSES_AVAILABLE','PROVIDER_SELECTED','NO_PROVIDER_FOUND');

create or replace function public.create_service_request_v5(
  p_category_id uuid default null,
  p_service_definition_id uuid default null,
  p_service_id uuid default null,
  p_description text default '',
  p_suburb text default null,
  p_city text default null,
  p_state text default null,
  p_country text default null,
  p_address_line1 text default null,
  p_postal_code text default null,
  p_service_address_label text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_location_source text default null,
  p_location_accuracy_m numeric default null,
  p_location_confirmed boolean default false,
  p_preferred_date date default null,
  p_preferred_time time default null,
  p_timing_mode text default 'FLEXIBLE',
  p_time_window_start time default null,
  p_time_window_end time default null,
  p_budget numeric default null,
  p_budget_min numeric default null,
  p_budget_max numeric default null,
  p_delivery_mode public.service_delivery_mode default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  rid uuid;
  key_v text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if key_v is null or length(key_v) not between 16 and 128 then
    raise exception 'Invalid request idempotency key';
  end if;

  select id into rid
  from public.service_requests
  where customer_id=auth.uid() and request_idempotency_key=key_v
  limit 1;
  if rid is not null then return rid; end if;

  begin
    rid:=public.create_service_request_v4(
      p_category_id,p_service_definition_id,p_service_id,p_description,
      p_suburb,p_city,p_state,p_country,p_address_line1,p_postal_code,p_service_address_label,
      p_latitude,p_longitude,p_location_source,p_location_accuracy_m,p_location_confirmed,
      p_preferred_date,p_preferred_time,p_timing_mode,p_time_window_start,p_time_window_end,
      p_budget,p_budget_min,p_budget_max,p_delivery_mode
    );
    update public.service_requests
      set request_idempotency_key=key_v
      where id=rid and customer_id=auth.uid();
  exception when unique_violation then
    select id into rid
    from public.service_requests
    where customer_id=auth.uid() and request_idempotency_key=key_v
    limit 1;
    if rid is null then raise; end if;
  end;

  return rid;
end
$$;

revoke all on function public.create_service_request_v5(
 uuid,uuid,uuid,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode,text
) from public,anon;
grant execute on function public.create_service_request_v5(
 uuid,uuid,uuid,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode,text
) to authenticated;

create or replace function public.start_everest_live(p_request_id uuid,p_arrival_window text default 'ASAP')
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 r public.service_requests;
 initial_radius numeric:=3;
 deadline timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_arrival_window not in ('ASAP','WITHIN_30_MINUTES','WITHIN_1_HOUR','TODAY') then raise exception 'Invalid arrival window'; end if;

 deadline:=case p_arrival_window
  when 'ASAP' then now()+interval '45 minutes'
  when 'WITHIN_30_MINUTES' then now()+interval '60 minutes'
  when 'WITHIN_1_HOUR' then now()+interval '90 minutes'
  else now()+interval '12 hours'
 end;

 select * into r
 from public.service_requests
 where id=p_request_id and customer_id=auth.uid()
 for update;

 if r.id is null then raise exception 'Request not found'; end if;
 if r.delivery_mode<>'REMOTE' and (
   not coalesce(r.location_confirmed,false)
   or r.latitude is null or r.longitude is null
   or nullif(trim(coalesce(r.address_line1,'')),'') is null
 ) then raise exception 'A confirmed precise service address is required for Everest Live'; end if;
 if r.status not in ('OPEN','MATCHING','QUOTING') then raise exception 'Request is not available for live search'; end if;

 -- Network retries must not expire already-notified businesses or restart the search.
 if r.is_live
   and r.live_status in ('SEARCHING','NOTIFYING','RESPONSES_AVAILABLE','PROVIDER_SELECTED','NO_PROVIDER_FOUND')
   and r.live_expires_at>now()
 then
   if r.requested_arrival_window is distinct from p_arrival_window
      and r.live_status in ('SEARCHING','NOTIFYING','NO_PROVIDER_FOUND')
   then
     update public.service_requests
       set requested_arrival_window=p_arrival_window,
           live_expires_at=deadline,
           updated_at=now()
       where id=r.id;
   end if;
   return r.id;
 end if;

 update public.service_requests
 set is_live=true,
     live_status='SEARCHING',
     live_started_at=coalesce(live_started_at,now()),
     live_expires_at=deadline,
     live_radius_km=initial_radius,
     live_radius_stage=1,
     requested_arrival_window=p_arrival_window,
     status='MATCHING',
     updated_at=now()
 where id=r.id;

 update public.opportunities
   set status='EXPIRED'
   where request_id=r.id and status='OPEN';

 perform public.release_everest_live_wave(r.id,initial_radius,1);
 return r.id;
end
$$;
revoke all on function public.start_everest_live(uuid,text) from public,anon;
grant execute on function public.start_everest_live(uuid,text) to authenticated;

create or replace function public.expand_everest_live(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
 r public.service_requests;
 next_radius numeric;
 next_stage integer;
begin
 select * into r
 from public.service_requests
 where id=p_request_id and customer_id=auth.uid()
 for update;

 if r.id is null then raise exception 'Request not found'; end if;
 if r.live_status not in ('SEARCHING','NOTIFYING','NO_PROVIDER_FOUND') or r.live_expires_at<=now() then return 0; end if;

 -- Realtime, foreground refresh and cron can all ask for an expansion.
 -- Treat calls inside this cooldown as the same logical request.
 if r.updated_at>now()-interval '15 seconds' then return 0; end if;

 next_stage:=least(r.live_radius_stage+1,4);
 next_radius:=case next_stage when 2 then 7 when 3 then 10 else 15 end;
 if next_stage=r.live_radius_stage then
   update public.service_requests set live_status='NO_PROVIDER_FOUND',updated_at=now() where id=r.id;
   return 0;
 end if;

 return public.release_everest_live_wave(r.id,next_radius,next_stage);
end
$$;
revoke all on function public.expand_everest_live(uuid) from public,anon;
grant execute on function public.expand_everest_live(uuid) to authenticated;

create or replace function public.get_everest_live_state(p_request_id uuid)
returns table(
 request_id uuid,
 live_status text,
 radius_km numeric,
 radius_stage integer,
 expires_at timestamptz,
 eligible_count bigint,
 notified_count bigint,
 viewed_count bigint,
 responding_count bigint,
 quote_count bigint
)
language sql
stable
security invoker
set search_path=''
as $$
 with request_row as (
  select r.id,r.live_status,r.live_radius_km,r.live_radius_stage,r.live_expires_at
  from public.service_requests r
  where r.id=p_request_id and r.customer_id=auth.uid() and r.is_live
 ),
 match_counts as (
  select count(*)::bigint as eligible_count
  from public.service_matches m
  join request_row r on r.id=m.request_id
  where coalesce(m.reason->>'everest_live','false')='true'
 ),
 opportunity_counts as (
  select
   count(*)::bigint as notified_count,
   count(*) filter(where o.viewed_at is not null)::bigint as viewed_count,
   count(*) filter(where o.responded_at is not null)::bigint as responding_count
  from public.opportunities o
  join request_row r on r.id=o.request_id
  where o.is_live
 ),
 quote_counts as (
  select count(*)::bigint as quote_count
  from public.quotes q
  join request_row r on r.id=q.request_id
  where q.status in ('SENT','VIEWED','ACCEPTED')
 )
 select
  r.id,
  r.live_status,
  r.live_radius_km,
  r.live_radius_stage,
  r.live_expires_at,
  coalesce(m.eligible_count,0),
  coalesce(o.notified_count,0),
  coalesce(o.viewed_count,0),
  coalesce(o.responding_count,0),
  coalesce(q.quote_count,0)
 from request_row r
 cross join match_counts m
 cross join opportunity_counts o
 cross join quote_counts q
$$;
revoke all on function public.get_everest_live_state(uuid) from public,anon;
grant execute on function public.get_everest_live_state(uuid) to authenticated;

notify pgrst,'reload schema';
