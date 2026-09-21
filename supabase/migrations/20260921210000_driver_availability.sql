-- Additive driver availability state. Existing driver verification/operational gates remain authoritative.
create table if not exists public.driver_availability (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'OFFLINE' check (status in ('ONLINE','OFFLINE')),
  service_radius_km numeric(5,2) not null default 10 check (service_radius_km >= 1 and service_radius_km <= 100),
  updated_at timestamptz not null default now()
);
alter table public.driver_availability enable row level security;
drop policy if exists driver_availability_select_own on public.driver_availability;
create policy driver_availability_select_own on public.driver_availability for select to authenticated using (driver_id=auth.uid());
create index if not exists driver_availability_online_idx on public.driver_availability(status) where status='ONLINE';

create or replace function public.get_driver_availability()
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare uid uuid:=auth.uid(); row public.driver_availability;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 perform public.refresh_driver_verification_status(uid);
 if not public.driver_is_operational(uid) then raise exception 'Verified driver access is required'; end if;
 select * into row from public.driver_availability where driver_id=uid;
 if row.driver_id is null then
   insert into public.driver_availability(driver_id) values(uid) returning * into row;
 end if;
 return jsonb_build_object('status',row.status,'service_radius_km',row.service_radius_km,'updated_at',row.updated_at,
   'busy',exists(select 1 from public.delivery_assignments da join public.deliveries d on d.id=da.delivery_id
                 where da.driver_id=uid and da.accepted_at is not null and d.status not in ('DELIVERED','CANCELLED','FAILED')));
end;
$$;

create or replace function public.set_driver_availability(p_status text,p_service_radius_km numeric)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare uid uuid:=auth.uid(); normalized text:=upper(trim(p_status)); radius numeric:=p_service_radius_km; row public.driver_availability;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 perform public.refresh_driver_verification_status(uid);
 if not public.driver_is_operational(uid) then raise exception 'Verified driver access is required'; end if;
 if normalized not in ('ONLINE','OFFLINE') then raise exception 'Invalid availability status'; end if;
 if radius is null or radius < 1 or radius > 100 then raise exception 'Service radius must be between 1 and 100 km'; end if;
 if normalized='ONLINE' and exists(select 1 from public.delivery_assignments da join public.deliveries d on d.id=da.delivery_id
   where da.driver_id=uid and da.accepted_at is not null and d.status not in ('DELIVERED','CANCELLED','FAILED')) then
   raise exception 'Complete the active delivery before going online for new jobs';
 end if;
 insert into public.driver_availability(driver_id,status,service_radius_km,updated_at)
 values(uid,normalized,radius,now())
 on conflict(driver_id) do update set status=excluded.status,service_radius_km=excluded.service_radius_km,updated_at=now()
 returning * into row;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(uid,'SET_DRIVER_AVAILABILITY','DRIVER',uid,jsonb_build_object('status',row.status,'service_radius_km',row.service_radius_km));
 return jsonb_build_object('status',row.status,'service_radius_km',row.service_radius_km,'updated_at',row.updated_at,'busy',false);
end;
$$;
revoke all on public.driver_availability from anon,authenticated;
grant select on public.driver_availability to authenticated;
revoke all on function public.get_driver_availability() from public,anon,authenticated;
grant execute on function public.get_driver_availability() to authenticated;
revoke all on function public.set_driver_availability(text,numeric) from public,anon,authenticated;
grant execute on function public.set_driver_availability(text,numeric) to authenticated;