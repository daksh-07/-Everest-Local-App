-- Launch hardening: suspended business members must never advertise provider availability.
create or replace function public.set_service_provider_profile(
  p_business_id uuid,
  p_status text,
  p_service_radius_km numeric,
  p_travel_speed_kmh numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  uid uuid := (select auth.uid());
  cfg public.service_dispatch_config;
  row public.service_provider_profiles;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1
    from public.business_members bm
    join public.businesses b on b.id=bm.business_id
    where bm.user_id=uid
      and bm.business_id=p_business_id
      and bm.status='ACTIVE'
      and b.status='ACTIVE'
      and b.verification_status='VERIFIED'
  ) then raise exception 'Active verified business membership is required'; end if;

  if upper(trim(p_status)) not in('AVAILABLE','UNAVAILABLE') then raise exception 'Invalid provider availability'; end if;
  if p_service_radius_km is null or p_service_radius_km not between 1 and 100 then raise exception 'Invalid service radius'; end if;
  if upper(trim(p_status))='AVAILABLE' and exists(
    select 1 from public.service_dispatch_assignments a
    where a.provider_id=uid and a.completed_at is null
  ) then raise exception 'Provider has an active assignment'; end if;

  select * into cfg from public.service_dispatch_config where id=true;

  insert into public.service_provider_profiles(
    provider_id,business_id,availability_status,service_radius_km,travel_speed_kmh,updated_at
  ) values(
    uid,p_business_id,upper(trim(p_status)),p_service_radius_km,
    coalesce(p_travel_speed_kmh,cfg.default_travel_speed_kmh),now()
  )
  on conflict(provider_id) do update set
    business_id=excluded.business_id,
    availability_status=excluded.availability_status,
    service_radius_km=excluded.service_radius_km,
    travel_speed_kmh=excluded.travel_speed_kmh,
    updated_at=now()
  returning * into row;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(uid,'SET_SERVICE_PROVIDER_AVAILABILITY','SERVICE_PROVIDER',uid,
    jsonb_build_object('business_id',row.business_id,'status',row.availability_status,'service_radius_km',row.service_radius_km));

  return jsonb_build_object(
    'provider_id',row.provider_id,'business_id',row.business_id,'status',row.availability_status,
    'service_radius_km',row.service_radius_km,'travel_speed_kmh',row.travel_speed_kmh,'updated_at',row.updated_at
  );
end;
$function$;

revoke all on function public.set_service_provider_profile(uuid,text,numeric,numeric) from public, anon;
grant execute on function public.set_service_provider_profile(uuid,text,numeric,numeric) to authenticated;
