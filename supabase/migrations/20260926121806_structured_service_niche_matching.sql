-- Structured service niche selection for customer requests and exact provider matching.

alter table public.service_requests
  add column if not exists service_definition_id uuid references public.service_definitions(id) on delete restrict;

create index if not exists service_requests_definition_idx
  on public.service_requests(service_definition_id,status,created_at desc);

create or replace function public.create_service_request_v3(
  p_category_id uuid default null,
  p_service_definition_id uuid default null,
  p_service_id uuid default null,
  p_description text default '',
  p_suburb text default null,
  p_city text default null,
  p_state text default null,
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
  p_delivery_mode public.service_delivery_mode default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; effective_mode public.service_delivery_mode; definition_category uuid; definition_mode public.service_delivery_mode;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_description))<5 or length(trim(p_description))>5000 then raise exception 'Invalid service description'; end if;
  if p_preferred_date is not null and p_preferred_date<current_date then raise exception 'Preferred date cannot be in the past'; end if;
  if p_timing_mode not in ('ASAP','FLEXIBLE','TIME_WINDOW','EXACT_TIME') then raise exception 'Invalid timing mode'; end if;
  if p_budget is not null and p_budget<0 then raise exception 'Invalid budget'; end if;
  if p_budget_min is not null and p_budget_min<0 then raise exception 'Invalid budget'; end if;
  if p_budget_max is not null and p_budget_max<0 then raise exception 'Invalid budget'; end if;
  if p_budget_min is not null and p_budget_max is not null and p_budget_min>p_budget_max then raise exception 'Invalid budget range'; end if;

  if p_service_definition_id is not null then
    select category_id,default_delivery_mode into definition_category,definition_mode
    from public.service_definitions where id=p_service_definition_id and active=true;
    if definition_category is null then raise exception 'Selected service type is unavailable'; end if;
    p_category_id:=definition_category;
  end if;

  if p_service_id is not null then
    select s.delivery_mode,coalesce(s.service_definition_id,p_service_definition_id)
      into effective_mode,p_service_definition_id
    from public.services s where s.id=p_service_id and s.active=true;
    if effective_mode is null then raise exception 'Selected service is not available'; end if;
    if p_delivery_mode is not null and p_delivery_mode<>effective_mode and effective_mode<>'BOTH' then raise exception 'Requested delivery mode is not supported'; end if;
    if effective_mode='BOTH' and p_delivery_mode is not null then effective_mode:=p_delivery_mode; end if;
  else
    effective_mode:=coalesce(p_delivery_mode,definition_mode,'LOCAL'::public.service_delivery_mode);
  end if;

  if effective_mode='REMOTE' then
    p_suburb:=null;p_city:=null;p_state:=null;p_latitude:=null;p_longitude:=null;p_location_source:='REMOTE';p_location_confirmed:=true;
  elsif nullif(trim(coalesce(p_suburb,'')),'') is null or nullif(trim(coalesce(p_city,'')),'') is null or nullif(trim(coalesce(p_state,'')),'') is null then
    raise exception 'A confirmed service location is required for local work';
  elsif not coalesce(p_location_confirmed,false) then
    raise exception 'Confirm the service location before posting';
  end if;

  insert into public.service_requests(
    customer_id,category_id,service_definition_id,service_id,delivery_mode,description,suburb,city,state,latitude,longitude,
    location_source,location_accuracy_m,location_confirmed,preferred_date,preferred_time,timing_mode,
    time_window_start,time_window_end,budget,budget_min,budget_max,media_urls,status
  ) values(
    auth.uid(),p_category_id,p_service_definition_id,p_service_id,effective_mode,trim(p_description),nullif(trim(p_suburb),''),
    nullif(trim(p_city),''),nullif(trim(p_state),''),p_latitude,p_longitude,p_location_source,p_location_accuracy_m,
    p_location_confirmed,p_preferred_date,case when p_timing_mode='EXACT_TIME' then p_preferred_time else null end,
    p_timing_mode,case when p_timing_mode='TIME_WINDOW' then p_time_window_start else null end,
    case when p_timing_mode='TIME_WINDOW' then p_time_window_end else null end,p_budget,p_budget_min,p_budget_max,'{}','OPEN'
  ) returning id into rid;

  perform public.match_service_request(rid);
  return rid;
end $$;

revoke all on function public.create_service_request_v3(uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode) from public,anon;
grant execute on function public.create_service_request_v3(uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode) to authenticated;

create or replace function public.match_service_request(p_request_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.service_requests; matched integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.service_requests where id=p_request_id for update;
 if r.id is null or (r.customer_id<>auth.uid() and not public.is_admin()) then raise exception 'Not authorized'; end if;
 if r.status not in ('OPEN','MATCHING','QUOTING') then raise exception 'Request is no longer eligible for matching'; end if;
 if r.expires_at<=now() then raise exception 'Request expired'; end if;
 update public.service_requests set status='MATCHING',updated_at=now() where id=r.id;

 insert into public.service_matches(request_id,business_id,score,reason)
 select r.id,b.id,
   100
   + case when r.service_definition_id is not null and svc.service_definition_id=r.service_definition_id then 60 else 0 end
   + case when r.category_id is not null and (b.category_id=r.category_id or svc.category_id=r.category_id) then 20 else 0 end
   + case when r.service_id is not null and svc.id=r.service_id then 30 else 0 end,
   jsonb_build_object(
     'verified',true,
     'definition_match',(r.service_definition_id is null or svc.service_definition_id=r.service_definition_id),
     'service_match',(r.service_id is null or svc.id=r.service_id),
     'category_match',(r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id),
     'service_area_match',(r.delivery_mode='REMOTE' or area.id is not null),
     'delivery_mode',r.delivery_mode
   )
 from public.businesses b
 join public.services svc on svc.business_id=b.id and svc.active
   and (r.service_id is null or svc.id=r.service_id)
   and (r.service_definition_id is null or svc.service_definition_id=r.service_definition_id)
   and (svc.delivery_mode=r.delivery_mode or svc.delivery_mode='BOTH')
 left join public.service_areas area on area.business_id=b.id and area.active
   and r.delivery_mode='LOCAL' and r.state is not null and r.city is not null and r.suburb is not null
   and lower(area.state)=lower(r.state) and lower(area.city)=lower(r.city) and lower(area.suburb)=lower(r.suburb)
 where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
   and (r.delivery_mode='REMOTE' or area.id is not null)
   and (r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id)
 on conflict(request_id,business_id) do update set score=excluded.score,reason=excluded.reason;

 get diagnostics matched=row_count;
 perform public.release_service_request_wave(r.id,5);
 return matched;
end $$;

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
   coalesce((
     select min(public.dispatch_eta_proxy_seconds(r.latitude,r.longitude,l.latitude,l.longitude,coalesce(cfg.travel_speed_kmh,35)))
     from public.business_members bm
     join public.driver_availability da on da.driver_id=bm.user_id and da.status='ONLINE'
     join public.service_provider_locations l on l.provider_id=bm.user_id
     left join public.service_dispatch_provider_config cfg on cfg.provider_id=bm.user_id
     where bm.business_id=b.id and l.recorded_at>=now()-interval '10 minutes'
   ),null) eta_seconds
  from public.businesses b
  join public.services s on s.business_id=b.id and s.active
   and (r.service_id is null or s.id=r.service_id)
   and (r.service_definition_id is null or s.service_definition_id=r.service_definition_id)
   and (s.delivery_mode=r.delivery_mode or s.delivery_mode='BOTH')
  join public.business_availability ba on ba.business_id=b.id and ba.status='AVAILABLE_NOW'
   and (ba.available_until is null or ba.available_until>now())
  where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
   and (r.category_id is null or b.category_id=r.category_id or s.category_id=r.category_id)
   and not exists(select 1 from public.opportunities old where old.request_id=r.id and old.business_id=b.id)
   and not exists(
     select 1 from public.service_dispatch_assignments a
     join public.business_members bm on bm.user_id=a.provider_id
     where bm.business_id=b.id and a.completed_at is null
   )
   and (
    r.delivery_mode='REMOTE'
    or (
      r.latitude is not null and r.longitude is not null and b.latitude is not null and b.longitude is not null
      and public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude)<=p_radius_km
      and public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude)<=coalesce((
        select max(da.service_radius_km)
        from public.business_members bm join public.driver_availability da on da.driver_id=bm.user_id and da.status='ONLINE'
        where bm.business_id=b.id
      ),p_radius_km)
    )
    or exists(select 1 from public.service_areas a where a.business_id=b.id and a.active and lower(a.suburb)=lower(r.suburb) and lower(a.city)=lower(r.city) and lower(a.state)=lower(r.state))
   )
  order by b.id,distance_km nulls last
 ), inserted_matches as (
  insert into public.service_matches(request_id,business_id,score,reason)
  select r.id,e.business_id,greatest(0,260-coalesce(round(e.distance_km*5)::integer,0)),
   jsonb_build_object('everest_live',true,'exact_service_niche',r.service_definition_id is not null,'radius_stage',p_stage,'distance_km',case when e.distance_km is null then null else round(e.distance_km,1) end,'eta_seconds',e.eta_seconds)
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
  jsonb_build_object('radius_km',p_radius_km,'stage',p_stage,'providers_notified',released,'service_definition_id',r.service_definition_id));
 return released;
end $$;

revoke all on function public.release_everest_live_wave(uuid,numeric,integer) from public,anon,authenticated;
