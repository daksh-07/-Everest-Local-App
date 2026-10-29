-- Review only. Country identity is one eligibility predicate, not a supported-market or shipping promise.
-- Retain all existing authentication, radius, capability, payment, availability and lifecycle guards.
create schema if not exists private;
create or replace function private.marketplace_country_key(p_value text)
returns text language sql immutable set search_path='' as $$
 with country as (select lower(btrim(regexp_replace(coalesce(p_value,''),'[[:space:]]+',' ','g'))) value)
 select case when length(value)<2 or length(value)>150 or value~'[0-9%_*<>/]' or position(chr(92) in value)>0 then null
 when value in ('au','aus','australia') then 'au'
 when value in ('ca','can','canada') then 'ca'
 when value in ('in','ind','india') then 'in'
 when value in ('us','usa','united states','united states of america') then 'us'
 when value in ('gb','gbr','uk','united kingdom') then 'gb'
 when value in ('nz','nzl','new zealand') then 'nz'
 else value end from country
$$;
revoke all on function private.marketplace_country_key(text) from public,anon,authenticated;
create or replace function private.marketplace_countries_match(a text,b text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(private.marketplace_country_key(a)=private.marketplace_country_key(b),false)
$$;
revoke all on function private.marketplace_countries_match(text,text) from public,anon,authenticated;
-- MATCHING FUNCTIONS: definitions retain the existing function ACLs.
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
   and (r.delivery_mode='REMOTE' or private.marketplace_countries_match(r.country,b.country))
   and (r.delivery_mode='REMOTE' or area.id is not null)
   and (r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id)
 on conflict(request_id,business_id) do update set score=excluded.score,reason=excluded.reason;

 get diagnostics matched=row_count;
 perform public.release_service_request_wave(r.id,5);
 return matched;
end $$;

create or replace function public.release_service_request_wave(p_request_id uuid,p_limit integer default 5)
returns integer language plpgsql security definer set search_path=''
as $$
declare released integer:=0; r public.service_requests;
begin
 select * into r from public.service_requests where id=p_request_id for update;
 if r.id is null or r.status not in ('MATCHING','QUOTING') or r.expires_at<=now() then return 0; end if;
 if r.matching_wave_count>=3 then return 0; end if;

 with candidates as (
   select sm.business_id
   from public.service_matches sm
   join public.businesses eligible_business on eligible_business.id=sm.business_id
   where sm.request_id=r.id
     and eligible_business.status='ACTIVE' and eligible_business.verification_status='VERIFIED' and eligible_business.accepts_requests
     and (r.delivery_mode='REMOTE' or private.marketplace_countries_match(r.country,eligible_business.country))
     and not exists(select 1 from public.opportunities o where o.request_id=r.id and o.business_id=sm.business_id)
   order by sm.score desc,
     nullif((sm.reason->>'distance_km')::numeric,null) asc nulls last,
     sm.created_at asc
   limit greatest(1,least(coalesce(p_limit,5),5))
 ), ins as (
   insert into public.opportunities(request_id,business_id,expires_at)
   select r.id,c.business_id,least(r.expires_at,now()+interval '48 hours') from candidates c
   on conflict(request_id,business_id) do nothing
   returning business_id
 )
 select count(*) into released from ins;

 if released>0 then
   insert into public.notifications(user_id,kind,title,body,data)
   select b.owner_id,'NEW_OPPORTUNITY','New local lead','A matched customer request is ready for your response.',
     jsonb_build_object('request_id',r.id)
   from public.businesses b
   where b.id in (
     select o.business_id from public.opportunities o
     where o.request_id=r.id and o.created_at>=now()-interval '5 seconds'
   );
   update public.service_requests
      set status='QUOTING',matching_wave_count=matching_wave_count+1,last_match_wave_at=now(),updated_at=now()
    where id=r.id;
 elsif r.status='MATCHING' then
   update public.service_requests set status='QUOTING',updated_at=now() where id=r.id;
 end if;
 return released;
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
   and (ba.available_from is null or ba.available_from<=now())
   and (ba.available_until is null or ba.available_until>now())
  where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
   and (r.delivery_mode='REMOTE' or private.marketplace_countries_match(r.country,b.country))
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
        where bm.business_id=b.id
          and bm.status='ACTIVE'
      ),p_radius_km)
    )
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
  status=case when released>0 and status in ('OPEN','MATCHING') then 'QUOTING' else status end,
  live_status=case when released>0 then 'NOTIFYING' else 'SEARCHING' end,updated_at=now() where id=r.id;
 perform public.everest_live_audit(r.id,case when p_stage=1 then 'EVEREST_LIVE_STARTED' else 'EVEREST_LIVE_RADIUS_EXPANDED' end,
  jsonb_build_object('radius_km',p_radius_km,'stage',p_stage,'providers_notified',released,'service_definition_id',r.service_definition_id));
 return released;
end $$;

create or replace function public.list_my_business_opportunities(
  p_business_id uuid,
  p_status text default null
) returns table(
  id uuid,request_id uuid,status text,created_at timestamptz,expires_at timestamptz,
  description text,suburb text,city text,state text,preferred_date date,preferred_time time,
  timing_mode text,time_window_start time,time_window_end time,budget numeric,budget_min numeric,budget_max numeric,
  media_urls text[]
)
language sql security definer set search_path=''
as $$
  select o.id,o.request_id,o.status::text,o.created_at,o.expires_at,
    r.description,r.suburb,r.city,r.state,r.preferred_date,r.preferred_time,r.timing_mode,r.time_window_start,r.time_window_end,
    r.budget,r.budget_min,r.budget_max,r.media_urls
  from public.opportunities o
  join public.service_requests r on r.id=o.request_id
  where o.business_id=p_business_id
    and public.is_business_member(p_business_id)
    and exists(select 1 from public.businesses b where b.id=p_business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
      and (r.delivery_mode='REMOTE' or private.marketplace_countries_match(r.country,b.country)))
    and (p_status is null or o.status::text=p_status)
  order by o.created_at desc
$$;

-- WRITE GUARDS: protect direct RPC paths and pre-migration offers/quotes without expiring paid work.
create or replace function private.guard_marketplace_country()
returns trigger language plpgsql set search_path='' as $$
declare delivery text; customer_country text; business_country text;
begin
 -- Legacy/manual work without a service request retains its existing authorisation and lifecycle.
 if new.request_id is null then return new; end if;
 select r.delivery_mode::text,r.country,b.country into delivery,customer_country,business_country
 from public.service_requests r join public.businesses b on b.id=new.business_id where r.id=new.request_id;
 if not found then raise exception 'Request or business is unavailable'; end if;
 if delivery is distinct from 'REMOTE' and not private.marketplace_countries_match(customer_country,business_country) then
  raise exception using errcode='22023',message='This business cannot take local requests in the selected country. Check the request location.';
 end if;
 return new;
end $$;
revoke all on function private.guard_marketplace_country() from public,anon,authenticated;
-- INSERT and identity reassignment only. Existing paid-job status/completion updates are not invalidated.
drop trigger if exists marketplace_country_guard on public.opportunities;
create trigger marketplace_country_guard before insert or update of request_id,business_id on public.opportunities for each row execute function private.guard_marketplace_country();
drop trigger if exists marketplace_country_guard on public.quotes;
create trigger marketplace_country_guard before insert or update of request_id,business_id on public.quotes for each row execute function private.guard_marketplace_country();
drop trigger if exists marketplace_country_guard on public.bookings;
create trigger marketplace_country_guard before insert or update of request_id,business_id on public.bookings for each row execute function private.guard_marketplace_country();

-- Fulfilment identity, not worldwide carrier coverage. Cross-border delivery/shipping is not implemented.
create or replace function private.guard_order_fulfilment_country()
returns trigger language plpgsql set search_path='' as $$
declare order_business uuid; product_business uuid; method text; destination jsonb; origin text;
 product_state text; business_state text; verification text; accepting boolean; pickup boolean; delivery boolean; shipping boolean;
begin
 select o.business_id,p.business_id,o.delivery_method::text,o.delivery_address,b.country,
 p.status::text,b.status::text,b.verification_status::text,b.accepts_orders,p.pickup_available,p.delivery_eligible,p.shipping_available
 into order_business,product_business,method,destination,origin,product_state,business_state,verification,accepting,pickup,delivery,shipping
 from public.orders o join public.products p on p.id=new.product_id join public.businesses b on b.id=p.business_id where o.id=new.order_id;
 if not found or order_business is distinct from product_business or product_state is distinct from 'ACTIVE' or business_state is distinct from 'ACTIVE' or verification is distinct from 'VERIFIED' or accepting is distinct from true then
  raise exception using errcode='22023',message='MARKETPLACE_PRODUCT_UNAVAILABLE';
 end if;
 if private.marketplace_country_key(origin) is null then raise exception using errcode='22023',message='MARKETPLACE_FULFILMENT_UNKNOWN';end if;
 if method='PICKUP' then
  if pickup is distinct from true then raise exception using errcode='22023',message='MARKETPLACE_PRODUCT_UNAVAILABLE';end if;
 elsif method in ('EVEREST_DELIVERY','SAME_DAY','SHIPPING') then
  if private.marketplace_country_key(destination->>'country') is null then raise exception using errcode='22023',message='MARKETPLACE_DESTINATION_REQUIRED';end if;
  if not private.marketplace_countries_match(destination->>'country',origin) then raise exception using errcode='22023',message='MARKETPLACE_CROSS_BORDER_UNSUPPORTED';end if;
  if (method='SHIPPING' and shipping is distinct from true) or (method in ('EVEREST_DELIVERY','SAME_DAY') and delivery is distinct from true) then raise exception using errcode='22023',message='MARKETPLACE_PRODUCT_UNAVAILABLE';end if;
 else raise exception using errcode='22023',message='MARKETPLACE_PRODUCT_UNAVAILABLE';end if;
 return new;
end $$;
revoke all on function private.guard_order_fulfilment_country() from public,anon,authenticated;
drop trigger if exists order_fulfilment_country_guard on public.order_items;
create trigger order_fulfilment_country_guard before insert or update of order_id,product_id on public.order_items for each row execute function private.guard_order_fulfilment_country();

-- Order destination is a checkout snapshot. Starting a new attempt is required to change it.
create or replace function private.guard_order_destination_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
 if (new.business_id is distinct from old.business_id or new.delivery_method is distinct from old.delivery_method or new.delivery_address is distinct from old.delivery_address)
   and exists(select 1 from public.order_items i where i.order_id=old.id) then
  raise exception using errcode='22023',message='MARKETPLACE_DESTINATION_IMMUTABLE';
 end if;
 return new;
end $$;
revoke all on function private.guard_order_destination_snapshot() from public,anon,authenticated;
drop trigger if exists order_destination_snapshot_guard on public.orders;
create trigger order_destination_snapshot_guard before update of business_id,delivery_method,delivery_address on public.orders for each row execute function private.guard_order_destination_snapshot();
