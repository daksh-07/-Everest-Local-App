-- Repair Everest Live matching after the initial implementation referenced a removed provider profile table.
-- Current dispatch availability/location data is keyed directly by auth user/provider id.

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
     select min(public.dispatch_eta_proxy_seconds(
       r.latitude,r.longitude,l.latitude,l.longitude,coalesce(cfg.travel_speed_kmh,35)
     ))
     from public.business_members bm
     join public.driver_availability da on da.driver_id=bm.user_id and da.status='ONLINE'
     join public.service_provider_locations l on l.provider_id=bm.user_id
     left join public.service_dispatch_provider_config cfg on cfg.provider_id=bm.user_id
     where bm.business_id=b.id
       and l.recorded_at>=now()-interval '10 minutes'
   ),null) eta_seconds
  from public.businesses b
  join public.services s on s.business_id=b.id and s.active
   and (r.service_id is null or s.id=r.service_id)
   and (s.delivery_mode=r.delivery_mode or s.delivery_mode='BOTH')
  join public.business_availability ba on ba.business_id=b.id and ba.status='AVAILABLE_NOW'
   and (ba.available_until is null or ba.available_until>now())
  where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
   and (r.category_id is null or b.category_id=r.category_id or s.category_id=r.category_id)
   and not exists(select 1 from public.opportunities old where old.request_id=r.id and old.business_id=b.id)
   and not exists(
     select 1
     from public.service_dispatch_assignments a
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
        from public.business_members bm
        join public.driver_availability da on da.driver_id=bm.user_id and da.status='ONLINE'
        where bm.business_id=b.id
      ),p_radius_km)
    )
    or exists(
      select 1 from public.service_areas a
      where a.business_id=b.id and a.active
        and lower(a.suburb)=lower(r.suburb)
        and lower(a.city)=lower(r.city)
        and lower(a.state)=lower(r.state)
    )
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
