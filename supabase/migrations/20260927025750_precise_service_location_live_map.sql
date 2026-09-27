-- Precise service addresses + privacy-safe Everest Live map data.
-- Exact customer coordinates remain customer/private backend data. Live map business
-- points are derived only from businesses that actually received a Live opportunity.

alter table public.service_requests
  add column if not exists address_line1 text,
  add column if not exists postal_code text,
  add column if not exists service_address_label text;

alter table public.service_requests
  drop constraint if exists service_requests_address_line1_length,
  add constraint service_requests_address_line1_length
    check(address_line1 is null or length(address_line1) between 3 and 240),
  drop constraint if exists service_requests_postal_code_length,
  add constraint service_requests_postal_code_length
    check(postal_code is null or length(postal_code)<=24),
  drop constraint if exists service_requests_address_label_length,
  add constraint service_requests_address_label_length
    check(service_address_label is null or length(service_address_label)<=500);

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

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
        nullif(trim(p_country),'')
      );
    end if;

    update public.service_requests
    set address_line1=nullif(trim(p_address_line1),''),
        postal_code=nullif(trim(p_postal_code),''),
        country=nullif(trim(p_country),''),
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

create or replace function public.start_everest_live(p_request_id uuid,p_arrival_window text default 'ASAP')
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare r public.service_requests; initial_radius numeric:=3;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_arrival_window not in ('ASAP','WITHIN_30_MINUTES','WITHIN_1_HOUR','TODAY') then raise exception 'Invalid arrival window'; end if;
 select * into r from public.service_requests where id=p_request_id and customer_id=auth.uid() for update;
 if r.id is null then raise exception 'Request not found'; end if;
 if r.delivery_mode<>'REMOTE' and (
   not coalesce(r.location_confirmed,false)
   or r.latitude is null or r.longitude is null
   or nullif(trim(coalesce(r.address_line1,'')),'') is null
 ) then raise exception 'A confirmed precise service address is required for Everest Live'; end if;
 if r.status not in ('OPEN','MATCHING','QUOTING') then raise exception 'Request is not available for live search'; end if;
 update public.service_requests set is_live=true,live_status='SEARCHING',live_started_at=coalesce(live_started_at,now()),
  live_expires_at=case p_arrival_window when 'ASAP' then now()+interval '45 minutes' when 'WITHIN_30_MINUTES' then now()+interval '60 minutes' when 'WITHIN_1_HOUR' then now()+interval '90 minutes' else now()+interval '12 hours' end,
  live_radius_km=initial_radius,live_radius_stage=1,requested_arrival_window=p_arrival_window,status='MATCHING',updated_at=now() where id=r.id;
 update public.opportunities set status='EXPIRED' where request_id=r.id and status='OPEN';
 perform public.release_everest_live_wave(r.id,initial_radius,1);
 return r.id;
end
$$;
revoke all on function public.start_everest_live(uuid,text) from public,anon;
grant execute on function public.start_everest_live(uuid,text) to authenticated;

create or replace function public.get_everest_live_map_points(p_request_id uuid)
returns table(
  point_kind text,
  business_id uuid,
  latitude numeric,
  longitude numeric,
  activity text,
  distance_km numeric,
  eta_seconds integer,
  address_label text
)
language sql
stable
security definer
set search_path=''
as $$
  with request_row as (
    select r.*
    from public.service_requests r
    where r.id=p_request_id
      and r.customer_id=auth.uid()
      and r.is_live
  ),
  live_businesses as (
    select
      o.business_id,
      coalesce(b.latitude,provider.latitude) as raw_latitude,
      coalesce(b.longitude,provider.longitude) as raw_longitude,
      case
        when o.responded_at is not null then 'RESPONDED'
        when o.viewed_at is not null then 'VIEWED'
        else 'NOTIFIED'
      end as activity,
      o.approximate_distance_km,
      o.eta_seconds
    from public.opportunities o
    join request_row r on r.id=o.request_id
    join public.businesses b on b.id=o.business_id
    left join lateral (
      select l.latitude,l.longitude
      from public.business_members bm
      join public.service_provider_locations l on l.provider_id=bm.user_id
      where bm.business_id=o.business_id
        and l.recorded_at>=now()-interval '10 minutes'
      order by l.recorded_at desc
      limit 1
    ) provider on true
    where o.is_live
  )
  select
    'CUSTOMER'::text,null::uuid,r.latitude,r.longitude,'YOU'::text,
    0::numeric,0::integer,r.service_address_label
  from request_row r
  where r.latitude is not null and r.longitude is not null
  union all
  select
    'BUSINESS'::text,lb.business_id,
    round(lb.raw_latitude::numeric,2),
    round(lb.raw_longitude::numeric,2),
    lb.activity,
    lb.approximate_distance_km,
    lb.eta_seconds,
    null::text
  from live_businesses lb
  where lb.raw_latitude is not null and lb.raw_longitude is not null
$$;
revoke all on function public.get_everest_live_map_points(uuid) from public,anon;
grant execute on function public.get_everest_live_map_points(uuid) to authenticated;

create or replace function public.get_booking_service_location(p_booking_id uuid)
returns table(
  request_id uuid,
  address_line1 text,
  suburb text,
  city text,
  state text,
  postal_code text,
  country text,
  service_address_label text,
  latitude numeric,
  longitude numeric
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare b public.bookings;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if b.id is null then raise exception 'Booking not found'; end if;
 if auth.uid()<>b.customer_id
   and not (public.is_business_member(b.business_id) and b.status::text<>'CANCELLED')
   and not public.is_admin()
 then raise exception 'Not authorized'; end if;

 return query
 select r.id,r.address_line1,r.suburb,r.city,r.state,r.postal_code,r.country,
        r.service_address_label,r.latitude,r.longitude
 from public.service_requests r
 where r.id=b.request_id;
end
$$;
revoke all on function public.get_booking_service_location(uuid) from public,anon;
grant execute on function public.get_booking_service_location(uuid) to authenticated;

notify pgrst,'reload schema';
