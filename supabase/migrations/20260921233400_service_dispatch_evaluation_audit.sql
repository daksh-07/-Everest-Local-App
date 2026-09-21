create or replace function public.audit_service_dispatch_evaluations(p_job_id uuid)
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare inserted_count integer;
begin
  insert into public.service_dispatch_evaluations(job_id,provider_id,decision,reason)
  select p_job_id,p.provider_id,
    case when b.id is not null and pl.provider_id is not null and now()-pl.recorded_at<=cfg.location_freshness_seconds * interval '1 second' and cap.provider_id is not null and dist.distance_km<=p.service_radius_km and active.provider_id is null then 'ELIGIBLE' else 'EXCLUDED' end,
    case
      when b.id is null then 'BUSINESS_NOT_VERIFIED'
      when pl.provider_id is null then 'LOCATION_UNAVAILABLE'
      when now()-pl.recorded_at>cfg.location_freshness_seconds * interval '1 second' then 'LOCATION_STALE'
      when cap.provider_id is null then 'SERVICE_INCOMPATIBLE'
      when dist.distance_km>p.service_radius_km then 'OUTSIDE_SERVICE_RADIUS'
      when active.provider_id is not null then 'ACTIVE_ASSIGNMENT'
      when not b.accepts_requests then 'BUSINESS_NOT_ACCEPTING_REQUESTS'
      else 'ELIGIBLE'
    end
  from public.service_provider_profiles p
  left join public.businesses b on b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
  left join public.service_provider_locations pl on pl.provider_id=p.provider_id
  cross join public.service_dispatch_config cfg
  cross join lateral (select r.* from public.service_dispatch_jobs j join public.service_requests r on r.id=j.request_id where j.id=p_job_id) r
  left join lateral (
    select pc.provider_id from public.service_provider_capabilities pc where pc.provider_id=p.provider_id and (r.service_id is null or pc.service_id=r.service_id) limit 1
  ) cap on true
  left join lateral (
    select 6371*2*asin(sqrt(power(sin(radians((pl.latitude-r.latitude)/2)),2)+cos(radians(r.latitude))*cos(radians(pl.latitude))*power(sin(radians((pl.longitude-r.longitude)/2)),2))) distance_km
  ) dist on pl.provider_id is not null and r.latitude is not null and r.longitude is not null
  left join lateral (
    select a.provider_id from public.service_dispatch_assignments a where a.provider_id=p.provider_id and a.completed_at is null limit 1
  ) active on true
  where not exists(select 1 from public.service_dispatch_evaluations e where e.job_id=p_job_id and e.provider_id=p.provider_id and e.created_at>now()-interval '30 seconds');
  get diagnostics inserted_count=row_count;
  return inserted_count;
end;
$$;

create or replace function public.dispatch_next_service_provider(p_job_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare j public.service_dispatch_jobs; cfg public.service_dispatch_config; c record; oid uuid;
begin
  select * into j from public.service_dispatch_jobs where id=p_job_id for update;
  if j.id is null or j.status not in('SEARCHING','PROVIDER_OFFERED') then return null; end if;
  perform public.audit_service_dispatch_evaluations(p_job_id);
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

revoke all on function public.audit_service_dispatch_evaluations(uuid) from public,anon,authenticated;
revoke all on function public.dispatch_next_service_provider(uuid) from public,anon,authenticated;
