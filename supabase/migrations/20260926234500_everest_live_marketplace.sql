-- Everest Live extends the existing request -> match -> opportunity -> quote -> booking flow.
-- Exact coordinates remain on the customer-owned request and are never returned by Live RPCs.

alter table public.service_requests
  add column if not exists is_live boolean not null default false,
  add column if not exists live_status text,
  add column if not exists live_started_at timestamptz,
  add column if not exists live_expires_at timestamptz,
  add column if not exists live_radius_km numeric(5,2),
  add column if not exists live_radius_stage integer not null default 0,
  add column if not exists requested_arrival_window text;

alter table public.service_requests drop constraint if exists service_requests_live_status_check;
alter table public.service_requests add constraint service_requests_live_status_check check (
  live_status is null or live_status in ('SEARCHING','NOTIFYING','RESPONSES_AVAILABLE','PROVIDER_SELECTED','NO_PROVIDER_FOUND','EXPIRED','CANCELLED','BOOKED')
);
alter table public.service_requests drop constraint if exists service_requests_arrival_window_check;
alter table public.service_requests add constraint service_requests_arrival_window_check check (
  requested_arrival_window is null or requested_arrival_window in ('ASAP','WITHIN_30_MINUTES','WITHIN_1_HOUR','TODAY')
);

alter table public.opportunities
  add column if not exists notified_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists is_live boolean not null default false,
  add column if not exists approximate_distance_km numeric(6,2),
  add column if not exists eta_seconds integer;

create index if not exists service_requests_live_active_idx
  on public.service_requests(live_status,live_expires_at) where is_live;
create index if not exists opportunities_live_request_idx
  on public.opportunities(request_id,is_live,status,created_at);

create or replace function public.everest_distance_km(
  p_lat_a numeric,p_lon_a numeric,p_lat_b numeric,p_lon_b numeric
) returns numeric language sql immutable parallel safe set search_path='' as $$
 select case when p_lat_a is null or p_lon_a is null or p_lat_b is null or p_lon_b is null then null else
  6371*2*asin(sqrt(power(sin(radians((p_lat_b-p_lat_a)::double precision)/2),2)
  +cos(radians(p_lat_a::double precision))*cos(radians(p_lat_b::double precision))
  *power(sin(radians((p_lon_b-p_lon_a)::double precision)/2),2))) end
$$;
revoke all on function public.everest_distance_km(numeric,numeric,numeric,numeric) from public,anon,authenticated;

create or replace function public.everest_live_audit(p_request uuid,p_action text,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_action,'SERVICE_REQUEST',p_request,coalesce(p_metadata,'{}'::jsonb));
end $$;
revoke all on function public.everest_live_audit(uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.release_everest_live_wave(p_request_id uuid,p_radius_km numeric,p_stage integer)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.service_requests; released integer:=0;
begin
 select * into r from public.service_requests where id=p_request_id for update;
 if r.id is null or not r.is_live or r.live_status not in ('SEARCHING','NOTIFYING','NO_PROVIDER_FOUND') then return 0; end if;
 if r.live_expires_at<=now() then
  update public.service_requests set live_status='EXPIRED',status='CANCELLED',updated_at=now() where id=r.id;
  update public.opportunities set status='EXPIRED' where request_id=r.id and status='OPEN';
  return 0;
 end if;

 with eligible as (
  select distinct on (b.id) b.id business_id,
   public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude) distance_km,
   coalesce((select min(public.dispatch_eta_proxy_seconds(r.latitude,r.longitude,l.latitude,l.longitude,coalesce(sp.travel_speed_kmh,35)))
     from public.service_provider_profiles sp join public.service_provider_locations l on l.provider_id=sp.provider_id
     where sp.business_id=b.id and sp.availability_status='AVAILABLE'
       and l.recorded_at>=now()-interval '10 minutes'),null) eta_seconds
  from public.businesses b
  join public.services s on s.business_id=b.id and s.active
   and (r.service_id is null or s.id=r.service_id)
   and (s.delivery_mode=r.delivery_mode or s.delivery_mode='BOTH')
  join public.business_availability ba on ba.business_id=b.id and ba.status='AVAILABLE_NOW'
   and (ba.available_until is null or ba.available_until>now())
  where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
   and (r.category_id is null or b.category_id=r.category_id or s.category_id=r.category_id)
   and not exists(select 1 from public.opportunities old where old.request_id=r.id and old.business_id=b.id)
   and not exists(select 1 from public.service_dispatch_assignments a join public.service_provider_profiles sp on sp.provider_id=a.provider_id where sp.business_id=b.id and a.completed_at is null)
   and (
    r.delivery_mode='REMOTE'
    or (r.latitude is not null and r.longitude is not null and b.latitude is not null and b.longitude is not null
      and public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude)<=p_radius_km
      and public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude)<=coalesce((select max(sp.service_radius_km) from public.service_provider_profiles sp where sp.business_id=b.id),p_radius_km))
    or exists(select 1 from public.service_areas a where a.business_id=b.id and a.active and lower(a.suburb)=lower(r.suburb) and lower(a.city)=lower(r.city) and lower(a.state)=lower(r.state))
   )
  order by b.id,distance_km nulls last
 ), inserted_matches as (
  insert into public.service_matches(request_id,business_id,score,reason)
  select r.id,e.business_id,greatest(0,200-coalesce(round(e.distance_km*5)::integer,0)),
   jsonb_build_object('everest_live',true,'radius_stage',p_stage,'distance_km',case when e.distance_km is null then null else round(e.distance_km,1) end,'eta_seconds',e.eta_seconds)
  from eligible e on conflict(request_id,business_id) do update set score=excluded.score,reason=excluded.reason
  returning business_id,reason
 )
 insert into public.opportunities(request_id,business_id,status,expires_at,is_live,notified_at,approximate_distance_km,eta_seconds)
 select r.id,m.business_id,'OPEN',least(r.live_expires_at,now()+interval '20 minutes'),true,now(),
  (m.reason->>'distance_km')::numeric,(m.reason->>'eta_seconds')::integer from inserted_matches m
 on conflict(request_id,business_id) do nothing;
 get diagnostics released=row_count;

 update public.service_requests set live_radius_km=p_radius_km,live_radius_stage=p_stage,
  live_status=case when released>0 then 'NOTIFYING' else 'SEARCHING' end,updated_at=now() where id=r.id;
 perform public.everest_live_audit(r.id,case when p_stage=1 then 'EVEREST_LIVE_STARTED' else 'EVEREST_LIVE_RADIUS_EXPANDED' end,
  jsonb_build_object('radius_km',p_radius_km,'stage',p_stage,'providers_notified',released));
 return released;
end $$;
revoke all on function public.release_everest_live_wave(uuid,numeric,integer) from public,anon,authenticated;

create or replace function public.start_everest_live(p_request_id uuid,p_arrival_window text default 'ASAP')
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.service_requests; initial_radius numeric:=3;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_arrival_window not in ('ASAP','WITHIN_30_MINUTES','WITHIN_1_HOUR','TODAY') then raise exception 'Invalid arrival window'; end if;
 select * into r from public.service_requests where id=p_request_id and customer_id=auth.uid() for update;
 if r.id is null then raise exception 'Request not found'; end if;
 if r.delivery_mode<>'REMOTE' and not coalesce(r.location_confirmed,false) then raise exception 'A confirmed service area is required for Everest Live'; end if;
 if r.status not in ('OPEN','MATCHING','QUOTING') then raise exception 'Request is not available for live search'; end if;
 update public.service_requests set is_live=true,live_status='SEARCHING',live_started_at=coalesce(live_started_at,now()),
  live_expires_at=case p_arrival_window when 'ASAP' then now()+interval '45 minutes' when 'WITHIN_30_MINUTES' then now()+interval '60 minutes' when 'WITHIN_1_HOUR' then now()+interval '90 minutes' else now()+interval '12 hours' end,
  live_radius_km=initial_radius,live_radius_stage=1,requested_arrival_window=p_arrival_window,status='MATCHING',updated_at=now() where id=r.id;
 update public.opportunities set status='EXPIRED' where request_id=r.id and status='OPEN';
 perform public.release_everest_live_wave(r.id,initial_radius,1);
 return r.id;
end $$;
revoke all on function public.start_everest_live(uuid,text) from public,anon;
grant execute on function public.start_everest_live(uuid,text) to authenticated;

create or replace function public.expand_everest_live(p_request_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.service_requests; next_radius numeric; next_stage integer;
begin
 select * into r from public.service_requests where id=p_request_id and customer_id=auth.uid() for update;
 if r.id is null then raise exception 'Request not found'; end if;
 if r.live_status not in ('SEARCHING','NOTIFYING','NO_PROVIDER_FOUND') or r.live_expires_at<=now() then return 0; end if;
 next_stage:=least(r.live_radius_stage+1,4);
 next_radius:=case next_stage when 2 then 7 when 3 then 10 else 15 end;
 if next_stage=r.live_radius_stage then update public.service_requests set live_status='NO_PROVIDER_FOUND',updated_at=now() where id=r.id; return 0; end if;
 return public.release_everest_live_wave(r.id,next_radius,next_stage);
end $$;
revoke all on function public.expand_everest_live(uuid) from public,anon;
grant execute on function public.expand_everest_live(uuid) to authenticated;

create or replace function public.cancel_everest_live(p_request_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.service_requests set live_status='CANCELLED',status='CANCELLED',updated_at=now()
 where id=p_request_id and customer_id=auth.uid() and is_live and live_status not in ('BOOKED','CANCELLED','EXPIRED');
 if found then
  update public.opportunities set status='EXPIRED' where request_id=p_request_id and status='OPEN';
  perform public.everest_live_audit(p_request_id,'EVEREST_LIVE_CANCELLED');
  return true;
 end if;
 return false;
end $$;
revoke all on function public.cancel_everest_live(uuid) from public,anon;
grant execute on function public.cancel_everest_live(uuid) to authenticated;

create or replace function public.view_live_opportunity(p_opportunity_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.opportunities set viewed_at=coalesce(viewed_at,now())
 where id=p_opportunity_id and status='OPEN' and business_id in(select business_id from public.business_members where user_id=auth.uid());
 return found;
end $$;
revoke all on function public.view_live_opportunity(uuid) from public,anon;
grant execute on function public.view_live_opportunity(uuid) to authenticated;

create or replace function public.decline_opportunity(p_opportunity_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
 update public.opportunities set status='DECLINED',responded_at=now()
 where id=p_opportunity_id and status='OPEN'
 and business_id in(select bm.business_id from public.business_members bm where bm.user_id=auth.uid())
 returning opportunities.request_id into request_id;
 if request_id is not null then perform public.everest_live_audit(request_id,'EVEREST_LIVE_PROVIDER_DECLINED',jsonb_build_object('opportunity_id',p_opportunity_id));end if;
 return request_id is not null;
end $$;
revoke all on function public.decline_opportunity(uuid) from public,anon;
grant execute on function public.decline_opportunity(uuid) to authenticated;

create or replace function public.get_everest_live_state(p_request_id uuid)
returns table(request_id uuid,live_status text,radius_km numeric,radius_stage integer,expires_at timestamptz,
 eligible_count bigint,notified_count bigint,viewed_count bigint,responding_count bigint,quote_count bigint)
language sql security invoker set search_path='' as $$
 select r.id,r.live_status,r.live_radius_km,r.live_radius_stage,r.live_expires_at,
  (select count(*) from public.service_matches m where m.request_id=r.id and coalesce((m.reason->>'everest_live')::boolean,false)),
  (select count(*) from public.opportunities o where o.request_id=r.id and o.is_live),
  (select count(*) from public.opportunities o where o.request_id=r.id and o.is_live and o.viewed_at is not null),
  (select count(*) from public.opportunities o where o.request_id=r.id and o.is_live and o.responded_at is not null),
  (select count(*) from public.quotes q where q.request_id=r.id and q.status in ('SENT','VIEWED','ACCEPTED'))
 from public.service_requests r where r.id=p_request_id and r.customer_id=auth.uid() and r.is_live
$$;
revoke all on function public.get_everest_live_state(uuid) from public,anon;
grant execute on function public.get_everest_live_state(uuid) to authenticated;

create or replace function public.everest_live_quote_response()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('SENT','VIEWED','ACCEPTED') then
  update public.opportunities set responded_at=coalesce(responded_at,now()),status='RESPONDED'
   where request_id=new.request_id and business_id=new.business_id and is_live;
  update public.service_requests set live_status=case when new.status='ACCEPTED' then 'PROVIDER_SELECTED' else 'RESPONSES_AVAILABLE' end,updated_at=now()
   where id=new.request_id and is_live and live_status not in ('CANCELLED','EXPIRED','BOOKED');
  if old is null or old.status is distinct from new.status then
   perform public.everest_live_audit(new.request_id,case when new.status='ACCEPTED' then 'EVEREST_LIVE_PROVIDER_SELECTED' else 'EVEREST_LIVE_RESPONSE_RECEIVED' end,jsonb_build_object('quote_id',new.id,'business_id',new.business_id));
  end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_everest_live_quote_response on public.quotes;
create trigger trg_everest_live_quote_response after insert or update of status on public.quotes
for each row execute function public.everest_live_quote_response();
revoke all on function public.everest_live_quote_response() from public,anon,authenticated;

create or replace function public.sync_everest_live_request_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_live and new.status is distinct from old.status then
  if new.status='BOOKED' then new.live_status:='BOOKED';
  elsif new.status='CANCELLED' and new.live_status not in ('EXPIRED','CANCELLED') then new.live_status:='CANCELLED';end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_sync_everest_live_request_lifecycle on public.service_requests;
create trigger trg_sync_everest_live_request_lifecycle before update of status on public.service_requests
for each row execute function public.sync_everest_live_request_lifecycle();
revoke all on function public.sync_everest_live_request_lifecycle() from public,anon,authenticated;

create or replace function public.notify_opportunity_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare member_id uuid; r public.service_requests;
begin
 select * into r from public.service_requests where id=new.request_id;
 for member_id in select bm.user_id from public.business_members bm where bm.business_id=new.business_id loop
  insert into public.notifications(user_id,kind,title,body,data)
  values(member_id,case when new.is_live then 'EVEREST_LIVE_REQUEST' else 'NEW_OPPORTUNITY' end,
   case when new.is_live then 'Everest Live request' else 'New job near you' end,
   case when new.is_live then coalesce((select name from public.services where id=r.service_id),'Service')||' requested nearby · '||lower(replace(coalesce(r.requested_arrival_window,'ASAP'),'_',' ')) else 'A customer request matched your business.' end,
   jsonb_build_object('opportunity_id',new.id,'request_id',new.request_id,'business_id',new.business_id,'route','/opportunities','is_live',new.is_live));
 end loop;
 return new;
end $$;
revoke all on function public.notify_opportunity_insert() from public,anon,authenticated;

create or replace function public.process_everest_live_searches()
returns integer language plpgsql security definer set search_path='' as $$
declare x record; processed integer:=0; next_radius numeric;
begin
 update public.service_requests set live_status='EXPIRED',status='CANCELLED',updated_at=now()
 where is_live and live_status in ('SEARCHING','NOTIFYING','NO_PROVIDER_FOUND') and live_expires_at<=now();
 update public.opportunities o set status='EXPIRED' from public.service_requests r
 where o.request_id=r.id and o.status='OPEN' and r.is_live and r.live_status in ('EXPIRED','CANCELLED');
 for x in select id,live_radius_stage from public.service_requests where is_live and live_status in ('SEARCHING','NOTIFYING')
  and live_expires_at>now() and live_radius_stage<4 and updated_at<=now()-interval '1 minute' for update skip locked
 loop
  next_radius:=case x.live_radius_stage+1 when 2 then 7 when 3 then 10 else 15 end;
  perform public.release_everest_live_wave(x.id,next_radius,x.live_radius_stage+1);processed:=processed+1;
 end loop;
 return processed;
end $$;
revoke all on function public.process_everest_live_searches() from public,anon,authenticated;
grant execute on function public.process_everest_live_searches() to service_role;

do $$ declare jid bigint; begin
 select jobid into jid from cron.job where jobname='everest-live-searches';if jid is not null then perform cron.unschedule(jid);end if;
 perform cron.schedule('everest-live-searches','* * * * *','select public.process_everest_live_searches();');
end $$;

-- Existing RLS controls row visibility; publication entries enable reconnectable Postgres Changes.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_requests') then
  alter publication supabase_realtime add table public.service_requests;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='quotes') then
  alter publication supabase_realtime add table public.quotes;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='opportunities') then
  alter publication supabase_realtime add table public.opportunities;
 end if;
end $$;
