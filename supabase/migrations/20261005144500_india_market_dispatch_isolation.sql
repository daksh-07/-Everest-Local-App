-- Everest India Phase 2: server-authoritative market isolation for service matching.
-- Prevents AU and IN provider pools from crossing even when an older or modified client calls request RPCs directly.

create or replace function public.market_country_key(p_country text)
returns text
language sql
immutable
set search_path=''
as $$
  select case lower(trim(coalesce(p_country,'')))
    when 'in' then 'IN'
    when 'ind' then 'IN'
    when 'india' then 'IN'
    when 'au' then 'AU'
    when 'aus' then 'AU'
    when 'australia' then 'AU'
    else upper(trim(coalesce(p_country,'')))
  end
$$;

create or replace function public.create_service_request_v4(
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
  p_delivery_mode public.service_delivery_mode default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  rid uuid;
  effective_mode public.service_delivery_mode;
  label text;
  market_key text;
  canonical_country text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if nullif(trim(coalesce(p_country,'')),'') is not null then
    market_key:=public.market_country_key(p_country);
    if market_key not in ('AU','IN') then raise exception 'Unsupported service market'; end if;
    canonical_country:=case when market_key='IN' then 'India' else 'Australia' end;
    update public.profiles set country=canonical_country,updated_at=now() where id=auth.uid();
  end if;

  rid:=public.create_service_request_v3(
    p_category_id,p_service_definition_id,p_service_id,p_description,
    p_suburb,p_city,p_state,p_latitude,p_longitude,p_location_source,
    p_location_accuracy_m,p_location_confirmed,p_preferred_date,p_preferred_time,
    p_timing_mode,p_time_window_start,p_time_window_end,p_budget,p_budget_min,p_budget_max,p_delivery_mode
  );

  select delivery_mode into effective_mode
  from public.service_requests
  where id=rid and customer_id=auth.uid()
  for update;

  if effective_mode<>'REMOTE' then
    if nullif(trim(coalesce(p_address_line1,'')),'') is null then
      raise exception 'A street address is required for local service';
    end if;
    if p_latitude is null or p_longitude is null then
      raise exception 'A precise service location is required for local service';
    end if;
    if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception 'Invalid service coordinates';
    end if;
    if not coalesce(p_location_confirmed,false) then
      raise exception 'Confirm the precise service location before posting';
    end if;

    label:=nullif(trim(coalesce(p_service_address_label,'')),'');
    if label is null then
      label:=concat_ws(', ',
        nullif(trim(p_address_line1),''),
        nullif(trim(p_suburb),''),
        case when nullif(trim(coalesce(p_city,'')),'') is distinct from nullif(trim(coalesce(p_suburb,'')),'') then nullif(trim(p_city),'') end,
        nullif(trim(concat_ws(' ',p_state,p_postal_code)),''),
        canonical_country
      );
    end if;

    update public.service_requests
    set address_line1=nullif(trim(p_address_line1),''),
        postal_code=nullif(trim(p_postal_code),''),
        country=canonical_country,
        service_address_label=left(label,500),
        updated_at=now()
    where id=rid and customer_id=auth.uid();
  else
    update public.service_requests
    set address_line1=null,postal_code=null,service_address_label=null,country=null
    where id=rid and customer_id=auth.uid();
  end if;

  return rid;
end
$$;

revoke all on function public.create_service_request_v4(
 uuid,uuid,uuid,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode
) from public,anon;
grant execute on function public.create_service_request_v4(
 uuid,uuid,uuid,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode
) to authenticated;

create or replace function public.match_service_request(p_request_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.service_requests; matched integer:=0; request_market text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.service_requests where id=p_request_id for update;
 if r.id is null or (r.customer_id<>auth.uid() and not public.is_admin()) then raise exception 'Not authorized'; end if;
 if r.status not in ('OPEN','MATCHING','QUOTING') then raise exception 'Request is no longer eligible for matching'; end if;
 if r.expires_at<=now() then raise exception 'Request expired'; end if;

 select public.market_country_key(coalesce(nullif(trim(r.country),''),p.country,'Australia'))
 into request_market
 from public.profiles p
 where p.id=r.customer_id;
 request_market:=coalesce(nullif(request_market,''),'AU');

 update public.service_requests set status='MATCHING',updated_at=now() where id=r.id;

 update public.opportunities o
 set status='EXPIRED'
 from public.businesses b
 where o.request_id=r.id and o.business_id=b.id and o.status='OPEN'
   and public.market_country_key(coalesce(nullif(trim(b.country),''),'Australia'))<>request_market;

 delete from public.service_matches sm
 using public.businesses b
 where sm.request_id=r.id and sm.business_id=b.id
   and public.market_country_key(coalesce(nullif(trim(b.country),''),'Australia'))<>request_market;

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
     'delivery_mode',r.delivery_mode,
     'market',request_market
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
   and public.market_country_key(coalesce(nullif(trim(b.country),''),'Australia'))=request_market
   and (r.delivery_mode='REMOTE' or area.id is not null)
   and (r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id)
 on conflict(request_id,business_id) do update set score=excluded.score,reason=excluded.reason;

 get diagnostics matched=row_count;
 perform public.release_service_request_wave(r.id,5);
 return matched;
end $$;

revoke all on function public.match_service_request(uuid) from public,anon;
grant execute on function public.match_service_request(uuid) to authenticated;

create or replace function public.release_everest_live_wave(p_request_id uuid,p_radius_km numeric,p_stage integer)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.service_requests; released integer:=0; request_market text;
begin
 select * into r from public.service_requests where id=p_request_id for update;
 if r.id is null or not r.is_live or r.live_status not in ('SEARCHING','NOTIFYING','NO_PROVIDER_FOUND') then return 0; end if;
 if r.live_expires_at<=now() then
  update public.service_requests set live_status='EXPIRED',status='CANCELLED',updated_at=now() where id=r.id;
  update public.opportunities set status='EXPIRED' where request_id=r.id and status='OPEN';
  return 0;
 end if;

 select public.market_country_key(coalesce(nullif(trim(r.country),''),p.country,'Australia'))
 into request_market
 from public.profiles p
 where p.id=r.customer_id;
 request_market:=coalesce(nullif(request_market,''),'AU');

 with eligible as (
  select distinct on (b.id) b.id business_id,
   public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude) distance_km,
   coalesce((
     select min(public.dispatch_eta_proxy_seconds(r.latitude,r.longitude,l.latitude,l.longitude,coalesce(cfg.travel_speed_kmh,35)))
     from public.business_members bm
     join public.driver_availability da on da.driver_id=bm.user_id and da.status='ONLINE'
     join public.service_provider_locations l on l.provider_id=bm.user_id
     left join public.service_dispatch_provider_config cfg on cfg.provider_id=bm.user_id
     where bm.business_id=b.id
       and bm.status='ACTIVE'
       and l.recorded_at>=now()-interval '10 minutes'
   ),null) eta_seconds
  from public.businesses b
  join public.services s on s.business_id=b.id and s.active
   and (r.service_id is null or s.id=r.service_id)
   and (r.service_definition_id is null or s.service_definition_id=r.service_definition_id)
   and (s.delivery_mode=r.delivery_mode or s.delivery_mode='BOTH')
  join public.business_availability ba on ba.business_id=b.id and ba.status='AVAILABLE_NOW'
   and (ba.available_until is null or ba.available_until>now())
  where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
   and public.market_country_key(coalesce(nullif(trim(b.country),''),'Australia'))=request_market
   and (r.category_id is null or b.category_id=r.category_id or s.category_id=r.category_id)
   and not exists(select 1 from public.opportunities old where old.request_id=r.id and old.business_id=b.id)
   and not exists(
     select 1 from public.service_dispatch_assignments a
     join public.business_members bm on bm.user_id=a.provider_id
     where bm.business_id=b.id and bm.status='ACTIVE' and a.completed_at is null
   )
   and (
    r.delivery_mode='REMOTE'
    or (
      r.latitude is not null and r.longitude is not null and b.latitude is not null and b.longitude is not null
      and public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude)<=p_radius_km
      and public.everest_distance_km(r.latitude,r.longitude,b.latitude,b.longitude)<=coalesce((
        select max(da.service_radius_km)
        from public.business_members bm
        join public.driver_availability da on da.driver_id=bm.user_id and da.status='ONLINE'
        where bm.business_id=b.id and bm.status='ACTIVE'
      ),p_radius_km)
    )
    or exists(select 1 from public.service_areas a where a.business_id=b.id and a.active and lower(a.suburb)=lower(r.suburb) and lower(a.city)=lower(r.city) and lower(a.state)=lower(r.state))
   )
  order by b.id,distance_km nulls last
 ), inserted_matches as (
  insert into public.service_matches(request_id,business_id,score,reason)
  select r.id,e.business_id,greatest(0,260-coalesce(round(e.distance_km*5)::integer,0)),
   jsonb_build_object('everest_live',true,'exact_service_niche',r.service_definition_id is not null,'radius_stage',p_stage,'distance_km',case when e.distance_km is null then null else round(e.distance_km,1) end,'eta_seconds',e.eta_seconds,'market',request_market)
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
  jsonb_build_object('radius_km',p_radius_km,'stage',p_stage,'providers_notified',released,'service_definition_id',r.service_definition_id,'market',request_market));
 return released;
end $$;

revoke all on function public.release_everest_live_wave(uuid,numeric,integer) from public,anon,authenticated;

notify pgrst,'reload schema';
