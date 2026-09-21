create table if not exists public.service_dispatch_evaluations(
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_dispatch_jobs(id) on delete cascade,
  provider_id uuid not null references public.service_provider_profiles(provider_id) on delete cascade,
  decision text not null check(decision in('ELIGIBLE','EXCLUDED')),
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists service_dispatch_evaluations_job_idx on public.service_dispatch_evaluations(job_id,created_at desc);
alter table public.service_dispatch_evaluations enable row level security;
revoke all on public.service_dispatch_evaluations from anon,authenticated;

create or replace function public.set_service_request_location(p_request_id uuid,p_latitude numeric,p_longitude numeric)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid location'; end if;
  update public.service_requests set latitude=p_latitude,longitude=p_longitude,updated_at=now()
  where id=p_request_id and customer_id=(select auth.uid()) and status not in('BOOKED','COMPLETED','CANCELLED');
  if not found then raise exception 'Request not found or no longer editable'; end if;
  return true;
end;
$$;

create or replace function public.set_service_provider_profile(p_business_id uuid,p_status text,p_service_radius_km numeric,p_travel_speed_kmh numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare uid uuid:=(select auth.uid()); cfg public.service_dispatch_config; row public.service_provider_profiles;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.user_id=uid and bm.business_id=p_business_id and b.status='ACTIVE' and b.verification_status='VERIFIED') then raise exception 'Verified business membership is required'; end if;
  if upper(trim(p_status)) not in('AVAILABLE','UNAVAILABLE') then raise exception 'Invalid provider availability'; end if;
  if p_service_radius_km is null or p_service_radius_km not between 1 and 100 then raise exception 'Invalid service radius'; end if;
  if upper(trim(p_status))='AVAILABLE' and exists(select 1 from public.service_dispatch_assignments a where a.provider_id=uid and a.completed_at is null) then raise exception 'Provider has an active assignment'; end if;
  select * into cfg from public.service_dispatch_config where id=true;
  insert into public.service_provider_profiles(provider_id,business_id,availability_status,service_radius_km,travel_speed_kmh,updated_at)
  values(uid,p_business_id,upper(trim(p_status)),p_service_radius_km,coalesce(p_travel_speed_kmh,cfg.default_travel_speed_kmh),now())
  on conflict(provider_id) do update set business_id=excluded.business_id,availability_status=excluded.availability_status,service_radius_km=excluded.service_radius_km,travel_speed_kmh=excluded.travel_speed_kmh,updated_at=now()
  returning * into row;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(uid,'SET_SERVICE_PROVIDER_AVAILABILITY','SERVICE_PROVIDER',uid,jsonb_build_object('business_id',row.business_id,'status',row.availability_status,'service_radius_km',row.service_radius_km));
  return jsonb_build_object('provider_id',row.provider_id,'business_id',row.business_id,'status',row.availability_status,'service_radius_km',row.service_radius_km,'travel_speed_kmh',row.travel_speed_kmh,'updated_at',row.updated_at);
end;
$$;

create or replace function public.update_service_provider_location(p_latitude numeric,p_longitude numeric,p_accuracy_m numeric,p_recorded_at timestamptz)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare uid uuid:=(select auth.uid()); cfg public.service_dispatch_config; previous public.service_provider_locations;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.service_provider_profiles where provider_id=uid) then raise exception 'Provider profile required'; end if;
  if p_latitude is null or p_longitude is null or p_recorded_at is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_recorded_at>now()+interval '2 minutes' then raise exception 'Invalid location'; end if;
  select * into cfg from public.service_dispatch_config where id=true;
  select * into previous from public.service_provider_locations where provider_id=uid;
  if previous.provider_id is not null and now()-previous.updated_at < make_interval(secs=>cfg.min_location_update_seconds) then return false; end if;
  insert into public.service_provider_locations(provider_id,latitude,longitude,accuracy_m,recorded_at,updated_at)
  values(uid,p_latitude,p_longitude,p_accuracy_m,p_recorded_at,now())
  on conflict(provider_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,recorded_at=excluded.recorded_at,updated_at=now();
  return true;
end;
$$;

create or replace function public.set_service_provider_capability(p_service_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare uid uuid:=(select auth.uid()); bid uuid;
begin
  select business_id into bid from public.service_provider_profiles where provider_id=uid;
  if bid is null then raise exception 'Provider profile required'; end if;
  if not exists(select 1 from public.services s where s.id=p_service_id and s.business_id=bid and s.active) then raise exception 'Service is not active for this business'; end if;
  if p_enabled then insert into public.service_provider_capabilities(provider_id,service_id) values(uid,p_service_id) on conflict do nothing; else delete from public.service_provider_capabilities where provider_id=uid and service_id=p_service_id; end if;
  return true;
end;
$$;

create or replace function public.get_service_dispatch_candidates(p_job_id uuid,p_limit integer default 5)
returns table(provider_id uuid,business_id uuid,eta_seconds integer,location_age_seconds integer,compatibility_score integer,expected_job_value numeric,estimated_duration_minutes integer)
language sql security definer set search_path to 'public'
as $$
with job as(select r.service_id,r.category_id,r.suburb,r.city,r.state,r.latitude,r.longitude from public.service_dispatch_jobs j join public.service_requests r on r.id=j.request_id where j.id=p_job_id),cfg as(select * from public.service_dispatch_config where id=true),candidates as(
select p.provider_id,p.business_id,
  greatest(0,round((6371*2*asin(sqrt(power(sin(radians((pl.latitude-j.latitude)/2)),2)+cos(radians(j.latitude))*cos(radians(pl.latitude))*power(sin(radians((pl.longitude-j.longitude)/2)),2))))/nullif(p.travel_speed_kmh,0)*3600))::int eta_seconds,
  greatest(0,extract(epoch from(now()-pl.recorded_at)))::int location_age_seconds,
  case when j.service_id is not null then 100 else 80 end compatibility_score,
  (select s.base_price from public.services s where s.business_id=p.business_id and s.active and(j.service_id is null or s.id=j.service_id) order by s.base_price nulls last limit 1) expected_job_value,
  (select s.duration_minutes from public.services s where s.business_id=p.business_id and s.active and(j.service_id is null or s.id=j.service_id) order by s.duration_minutes desc nulls last limit 1) estimated_duration_minutes,
  6371*2*asin(sqrt(power(sin(radians((pl.latitude-j.latitude)/2)),2)+cos(radians(j.latitude))*cos(radians(pl.latitude))*power(sin(radians((pl.longitude-j.longitude)/2)),2))) distance_km
from public.service_provider_profiles p
join public.service_provider_locations pl on pl.provider_id=p.provider_id
join public.businesses b on b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
cross join job j cross join cfg c
where p.availability_status='AVAILABLE' and j.latitude is not null and j.longitude is not null
and now()-pl.recorded_at<=make_interval(secs=>c.location_freshness_seconds)
and ((j.service_id is not null and exists(select 1 from public.service_provider_capabilities pc where pc.provider_id=p.provider_id and pc.service_id=j.service_id)) or (j.service_id is null and (j.category_id is null or exists(select 1 from public.service_provider_capabilities pc join public.services s on s.id=pc.service_id where pc.provider_id=p.provider_id and s.category_id=j.category_id and s.active))))
and (j.suburb is null or j.city is null or j.state is null or exists(select 1 from public.service_areas sa where sa.business_id=p.business_id and sa.active and lower(sa.suburb)=lower(j.suburb) and lower(sa.city)=lower(j.city) and lower(sa.state)=lower(j.state)))
and not exists(select 1 from public.service_dispatch_assignments a where a.provider_id=p.provider_id and a.completed_at is null))
select provider_id,business_id,eta_seconds,location_age_seconds,compatibility_score,expected_job_value,estimated_duration_minutes from candidates c
where c.distance_km <= (select p.service_radius_km from public.service_provider_profiles p where p.provider_id=c.provider_id)
order by eta_seconds,location_age_seconds,compatibility_score,provider_id
limit greatest(1,least(p_limit,25));
$$;

create or replace function public.dispatch_next_service_provider(p_job_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare j public.service_dispatch_jobs; cfg public.service_dispatch_config; c record; oid uuid;
begin
  select * into j from public.service_dispatch_jobs where id=p_job_id for update;
  if j.id is null or j.status not in('SEARCHING','PROVIDER_OFFERED') then return null; end if;
  select * into cfg from public.service_dispatch_config where id=true;
  select c.* into c from public.get_service_dispatch_candidates(p_job_id,25) c where not exists(select 1 from public.service_dispatch_offers o where o.job_id=p_job_id and o.provider_id=c.provider_id and o.status in('OFFERED','ACCEPTED','DECLINED','EXPIRED','REJECTED')) order by c.eta_seconds,c.location_age_seconds,c.compatibility_score,c.provider_id limit 1;
  if c.provider_id is null then update public.service_dispatch_jobs set status='EXHAUSTED',updated_at=now() where id=p_job_id; insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values((select auth.uid()),'SERVICE_DISPATCH_EXHAUSTED','SERVICE_DISPATCH_JOB',p_job_id,'{}'::jsonb); return null; end if;
  insert into public.service_dispatch_offers(job_id,provider_id,expires_at,eta_seconds,location_age_seconds,compatibility_score,expected_job_value,estimated_duration_minutes) values(p_job_id,c.provider_id,now()+make_interval(secs=>cfg.offer_timeout_seconds),c.eta_seconds,c.location_age_seconds,c.compatibility_score,c.expected_job_value,c.estimated_duration_minutes) returning id into oid;
  update public.service_dispatch_jobs set status='PROVIDER_OFFERED',estimated_duration_minutes=coalesce(j.estimated_duration_minutes,c.estimated_duration_minutes),updated_at=now() where id=p_job_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values((select auth.uid()),'SERVICE_PROVIDER_CONSIDERED','SERVICE_DISPATCH_JOB',p_job_id,jsonb_build_object('provider_id',c.provider_id,'eta_seconds',c.eta_seconds,'location_age_seconds',c.location_age_seconds,'compatibility_score',c.compatibility_score));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values((select auth.uid()),'SERVICE_DISPATCH_OFFER_CREATED','SERVICE_DISPATCH_OFFER',oid,jsonb_build_object('job_id',p_job_id,'provider_id',c.provider_id,'eta_seconds',c.eta_seconds));
  insert into public.notifications(user_id,kind,title,body,data) values(c.provider_id,'SERVICE_DISPATCH_OFFER','New service request','A nearby service request is available.',jsonb_build_object('offer_id',oid,'job_id',p_job_id,'eta_seconds',c.eta_seconds,'expected_job_value',c.expected_job_value,'estimated_duration_minutes',c.estimated_duration_minutes));
  return oid;
end;
$$;

create or replace function public.start_service_dispatch(p_request_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare r public.service_requests; j public.service_dispatch_jobs;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into r from public.service_requests where id=p_request_id for update;
  if r.id is null or r.customer_id<>(select auth.uid()) then raise exception 'Not authorized'; end if;
  if r.status in('BOOKED','COMPLETED','CANCELLED') then raise exception 'Request is not dispatchable'; end if;
  if r.latitude is null or r.longitude is null then raise exception 'Customer location is required before dispatch'; end if;
  if r.preferred_date is not null or r.preferred_time is not null then raise exception 'Scheduled dispatch is not enabled for this request yet'; end if;
  insert into public.service_dispatch_jobs(request_id,status,scheduled_start_at) values(r.id,'SEARCHING',now()) on conflict(request_id) do update set status=case when service_dispatch_jobs.status in('COMPLETED','CANCELLED') then service_dispatch_jobs.status else 'SEARCHING' end,updated_at=now() returning * into j;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values((select auth.uid()),'SERVICE_DISPATCH_STARTED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('request_id',r.id));
  perform public.dispatch_next_service_provider(j.id); return j.id;
end;
$$;

create or replace function public.respond_service_dispatch_offer(p_offer_id uuid,p_response text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare o public.service_dispatch_offers; j public.service_dispatch_jobs; r public.service_requests; response text:=upper(trim(p_response));
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if response not in('ACCEPT','DECLINE') then raise exception 'Invalid offer response'; end if;
  select * into o from public.service_dispatch_offers where id=p_offer_id for update;
  if o.id is null or o.provider_id<>(select auth.uid()) then raise exception 'Not authorized'; end if;
  select * into j from public.service_dispatch_jobs where id=o.job_id for update;
  if o.status<>'OFFERED' or j.status not in('SEARCHING','PROVIDER_OFFERED') then raise exception 'Job no longer available'; end if;
  if o.expires_at<=now() then update public.service_dispatch_offers set status='EXPIRED',responded_at=now() where id=o.id and status='OFFERED'; perform public.dispatch_next_service_provider(j.id); raise exception 'Job no longer available'; end if;
  if response='DECLINE' then update public.service_dispatch_offers set status='DECLINED',responded_at=now() where id=o.id and status='OFFERED'; insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values((select auth.uid()),'SERVICE_DISPATCH_OFFER_DECLINED','SERVICE_DISPATCH_OFFER',o.id,jsonb_build_object('job_id',j.id)); perform public.dispatch_next_service_provider(j.id); return jsonb_build_object('accepted',false,'job_id',j.id); end if;
  if not exists(select 1 from public.service_provider_profiles where provider_id=(select auth.uid()) and availability_status='AVAILABLE') then raise exception 'Provider is no longer available'; end if;
  if exists(select 1 from public.service_dispatch_assignments where provider_id=(select auth.uid()) and completed_at is null) then raise exception 'Provider already has an active assignment'; end if;
  update public.service_dispatch_jobs set status='ASSIGNED',claimed_provider_id=(select auth.uid()),claimed_at=now(),updated_at=now() where id=j.id and status='PROVIDER_OFFERED';
  if not found then update public.service_dispatch_offers set status='REJECTED',responded_at=now() where id=o.id and status='OFFERED'; insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values((select auth.uid()),'SERVICE_DISPATCH_ASSIGNMENT_REJECTED_ALREADY_CLAIMED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('offer_id',o.id)); raise exception 'Job no longer available'; end if;
  insert into public.service_dispatch_assignments(job_id,provider_id,scheduled_start_at,scheduled_end_at) values(j.id,(select auth.uid()),j.scheduled_start_at,case when j.estimated_duration_minutes is null then null else j.scheduled_start_at+make_interval(mins=>j.estimated_duration_minutes) end);
  update public.service_dispatch_offers set status='ACCEPTED',responded_at=now() where id=o.id; update public.service_dispatch_offers set status='REJECTED',responded_at=now() where job_id=j.id and id<>o.id and status='OFFERED'; update public.service_provider_profiles set availability_status='UNAVAILABLE',updated_at=now() where provider_id=(select auth.uid());
  select * into r from public.service_requests where id=j.request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values((select auth.uid()),'SERVICE_DISPATCH_ASSIGNMENT_WON','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('provider_id',(select auth.uid()),'request_id',r.id));
  insert into public.notifications(user_id,kind,title,body,data) values(r.customer_id,'SERVICE_PROVIDER_ACCEPTED','Provider accepted','A provider has accepted your service request.',jsonb_build_object('request_id',r.id,'job_id',j.id));
  return jsonb_build_object('accepted',true,'job_id',j.id,'provider_id',(select auth.uid()));
exception when unique_violation then raise exception 'Job no longer available'; end;
$$;

create or replace function public.process_service_dispatch_queue()
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare job_row record; expired_count integer:=0; changed integer;
begin
  for job_row in select j.id from public.service_dispatch_jobs j left join public.service_dispatch_offers o on o.job_id=j.id and o.status='OFFERED' where j.status in('SEARCHING','PROVIDER_OFFERED') and(o.id is null or o.expires_at<=now()) loop
    update public.service_dispatch_offers set status='EXPIRED',responded_at=now() where job_id=job_row.id and status='OFFERED' and expires_at<=now(); get diagnostics changed=row_count; expired_count:=expired_count+changed; perform public.dispatch_next_service_provider(job_row.id);
  end loop; return expired_count;
end;
$$;

revoke all on function public.set_service_request_location(uuid,numeric,numeric),public.set_service_provider_profile(uuid,text,numeric,numeric),public.update_service_provider_location(numeric,numeric,numeric,timestamptz),public.set_service_provider_capability(uuid,boolean),public.get_service_dispatch_candidates(uuid,integer),public.dispatch_next_service_provider(uuid),public.start_service_dispatch(uuid),public.respond_service_dispatch_offer(uuid,text),public.process_service_dispatch_queue() from public,anon,authenticated;
grant execute on function public.set_service_request_location(uuid,numeric,numeric),public.set_service_provider_profile(uuid,text,numeric,numeric),public.update_service_provider_location(numeric,numeric,numeric,timestamptz),public.set_service_provider_capability(uuid,boolean),public.start_service_dispatch(uuid),public.respond_service_dispatch_offer(uuid,text) to authenticated;
select cron.schedule('service-dispatch-queue','* * * * *','select public.process_service_dispatch_queue();') where not exists(select 1 from cron.job where jobname='service-dispatch-queue');