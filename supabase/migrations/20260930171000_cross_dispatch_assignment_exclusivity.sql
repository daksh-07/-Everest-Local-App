-- A provider/driver must never hold overlapping open Everest Delivery and
-- service-dispatch assignments. Reserve capacity as soon as an assignment is
-- created, not only after driver acceptance.

drop index if exists public.delivery_assignments_one_open_job_per_driver_idx;
create unique index delivery_assignments_one_open_job_per_driver_idx
on public.delivery_assignments(driver_id)
where completed_at is null;

create or replace function public.enforce_service_provider_cross_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.completed_at is null then
    perform pg_advisory_xact_lock(hashtextextended(new.provider_id::text,0));
    if exists(
      select 1
      from public.delivery_assignments d
      where d.driver_id=new.provider_id
        and d.completed_at is null
    ) then
      raise exception using
        errcode='23505',
        message='Provider already has an open Everest delivery assignment';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.enforce_delivery_driver_cross_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.completed_at is null then
    perform pg_advisory_xact_lock(hashtextextended(new.driver_id::text,0));
    if exists(
      select 1
      from public.service_dispatch_assignments s
      where s.provider_id=new.driver_id
        and s.completed_at is null
    ) then
      raise exception using
        errcode='23505',
        message='Driver already has an open Everest service assignment';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_service_provider_cross_assignment on public.service_dispatch_assignments;
create trigger trg_service_provider_cross_assignment
before insert or update of provider_id,completed_at
on public.service_dispatch_assignments
for each row execute function public.enforce_service_provider_cross_assignment();

drop trigger if exists trg_delivery_driver_cross_assignment on public.delivery_assignments;
create trigger trg_delivery_driver_cross_assignment
before insert or update of driver_id,completed_at
on public.delivery_assignments
for each row execute function public.enforce_delivery_driver_cross_assignment();

revoke all on function public.enforce_service_provider_cross_assignment() from public,anon,authenticated;
revoke all on function public.enforce_delivery_driver_cross_assignment() from public,anon,authenticated;


create or replace function public.assign_delivery_driver(p_delivery_id uuid,p_driver_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  d public.deliveries;
  availability public.driver_availability;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;

  perform public.refresh_driver_verification_status(p_driver_id);

  select * into d
  from public.deliveries
  where id=p_delivery_id
  for update;

  if d.id is null then raise exception 'Delivery not found'; end if;
  if d.status<>'READY_FOR_PICKUP' then
    raise exception 'Delivery must be ready for pickup before assignment';
  end if;
  if not public.driver_is_operational(p_driver_id) then
    raise exception 'Selected user is not an active verified delivery driver';
  end if;

  select * into availability
  from public.driver_availability
  where driver_id=p_driver_id
  for update;

  if availability.driver_id is null or availability.status<>'ONLINE' then
    raise exception 'Driver is not available for new jobs';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_driver_id::text,0));

  if exists(
    select 1
    from public.delivery_assignments x
    where x.driver_id=p_driver_id
      and x.completed_at is null
      and x.delivery_id<>d.id
  ) or exists(
    select 1
    from public.service_dispatch_assignments x
    where x.provider_id=p_driver_id
      and x.completed_at is null
  ) then
    raise exception 'Driver already has an active Everest job';
  end if;

  insert into public.delivery_assignments(delivery_id,driver_id,assigned_at)
  values(d.id,p_driver_id,now())
  on conflict(delivery_id) do update
  set driver_id=excluded.driver_id,
      assigned_at=now(),
      accepted_at=null,
      completed_at=null;

  update public.deliveries
  set status='ASSIGNED',updated_at=now()
  where id=d.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'ASSIGN_DELIVERY_DRIVER','DELIVERY',d.id,
    jsonb_build_object('driver_id',p_driver_id)
  );

  insert into public.notifications(user_id,kind,title,body,data)
  values(
    p_driver_id,'DELIVERY_ASSIGNED','New delivery assigned',
    'A new Everest delivery has been assigned to you.',
    jsonb_build_object('delivery_id',d.id,'order_id',d.order_id)
  );

  return true;
end
$$;

revoke all on function public.assign_delivery_driver(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_delivery_driver(uuid,uuid) to authenticated;


create or replace function public.get_service_dispatch_candidates(
  p_job_id uuid,
  p_limit integer default 25
)
returns table(
  provider_id uuid,
  business_id uuid,
  eta_seconds integer,
  location_age_seconds integer,
  compatibility_score integer,
  expected_job_value numeric,
  estimated_duration_minutes integer
)
language sql
security definer
set search_path='public'
as $$
with j as(
  select r.*
  from public.service_dispatch_jobs d
  join public.service_requests r on r.id=d.request_id
  where d.id=p_job_id
),
cfg as(
  select * from public.service_dispatch_config where id=true
)
select
  cap.provider_id,
  s.business_id,
  public.dispatch_eta_proxy_seconds(
    j.latitude,j.longitude,l.latitude,l.longitude,
    coalesce(pc.travel_speed_kmh,cfg.default_travel_speed_kmh)
  ),
  greatest(0,extract(epoch from(now()-l.recorded_at)))::integer,
  100,
  s.base_price,
  s.duration_minutes
from j
join public.service_provider_capabilities cap on cap.service_id=j.service_id
join public.services s on s.id=cap.service_id and s.active
join public.driver_availability da on da.driver_id=cap.provider_id and da.status='ONLINE'
join public.service_provider_locations l on l.provider_id=cap.provider_id
left join public.service_dispatch_provider_config pc on pc.provider_id=cap.provider_id
cross join cfg
where j.latitude is not null
  and j.longitude is not null
  and l.recorded_at>=now()-make_interval(secs=>cfg.location_freshness_seconds)
  and public.dispatch_driver_is_operational(cap.provider_id)
  and (
    6371.0088*2*asin(
      sqrt(
        power(sin(radians(l.latitude-j.latitude)/2),2)
        +cos(radians(j.latitude))*cos(radians(l.latitude))
        *power(sin(radians(l.longitude-j.longitude)/2),2)
      )
    )
  )<=da.service_radius_km
  and not exists(
    select 1 from public.service_dispatch_offers o
    where o.job_id=p_job_id and o.provider_id=cap.provider_id
  )
  and not exists(
    select 1 from public.service_dispatch_assignments a
    where a.provider_id=cap.provider_id and a.completed_at is null
  )
  and not exists(
    select 1 from public.delivery_assignments a
    where a.driver_id=cap.provider_id and a.completed_at is null
  )
order by 3,4,5,1
limit greatest(1,least(p_limit,25))
$$;

revoke all on function public.get_service_dispatch_candidates(uuid,integer) from public,anon;
grant execute on function public.get_service_dispatch_candidates(uuid,integer) to authenticated;
