alter table public.service_dispatch_jobs drop constraint if exists service_dispatch_jobs_status_check;
alter table public.service_dispatch_jobs add constraint service_dispatch_jobs_status_check
check(status in('SEARCHING','PROVIDER_OFFERED','ACCEPTED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED','EXHAUSTED'));

create or replace function public.cancel_service_dispatch_on_marketplace_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare j public.service_dispatch_jobs; v_request uuid;
begin
 v_request:=case when TG_TABLE_NAME='bookings' then NEW.request_id else NEW.id end;
 select * into j from public.service_dispatch_jobs where request_id=v_request for update;
 if j.id is not null and j.status not in('ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED','EXHAUSTED') then
  if (TG_TABLE_NAME='service_requests' and NEW.status<>'BOOKED')
     or (TG_TABLE_NAME='bookings' and NEW.status<>'CONFIRMED') then
   update public.service_dispatch_jobs set status='CANCELLED',updated_at=now() where id=j.id;
   insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
   values(null,'SERVICE_DISPATCH_CANCELLED','SERVICE_DISPATCH_JOB',j.id,
    jsonb_build_object('request_id',v_request,'source_table',TG_TABLE_NAME,'source_status',NEW.status));
  end if;
 end if;
 return NEW;
end $$;

drop trigger if exists trg_service_dispatch_request_lifecycle_cancel on public.service_requests;
create trigger trg_service_dispatch_request_lifecycle_cancel after update of status on public.service_requests
for each row execute function public.cancel_service_dispatch_on_marketplace_change();

drop trigger if exists trg_service_dispatch_booking_lifecycle_cancel on public.bookings;
create trigger trg_service_dispatch_booking_lifecycle_cancel after update of status on public.bookings
for each row execute function public.cancel_service_dispatch_on_marketplace_change();

create or replace function public.dispatch_next_service_provider(p_job_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare j public.service_dispatch_jobs; r public.service_requests; cfg public.service_dispatch_config; c record; oid uuid;
begin
 select * into j from public.service_dispatch_jobs where id=p_job_id for update;
 if j.id is null or j.status<>'SEARCHING' then return null; end if;
 select * into r from public.service_requests where id=j.request_id;
 select * into cfg from public.service_dispatch_config where id=true;
 for c in select da.driver_id provider_id from public.driver_applications ap join public.driver_availability da on da.driver_id=ap.user_id
   where ap.status='APPROVED' and not exists(select 1 from public.service_dispatch_offers o where o.job_id=j.id and o.provider_id=da.driver_id)
 loop
  if not exists(select 1 from public.service_provider_capabilities pc where pc.provider_id=c.provider_id and pc.service_id=r.service_id) then
   insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_PROVIDER_EXCLUDED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('provider_id',c.provider_id,'reason','SERVICE_CAPABILITY'));
  elsif not exists(select 1 from public.driver_availability da where da.driver_id=c.provider_id and da.status='ONLINE') then
   insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_PROVIDER_EXCLUDED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('provider_id',c.provider_id,'reason','OFFLINE'));
  elsif not public.dispatch_driver_is_operational(c.provider_id) then
   insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_PROVIDER_EXCLUDED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('provider_id',c.provider_id,'reason','NOT_OPERATIONAL'));
  elsif not exists(select 1 from public.service_provider_locations l join public.service_dispatch_config dc on dc.id=true where l.provider_id=c.provider_id and l.recorded_at>=now()-make_interval(secs=>dc.location_freshness_seconds)) then
   insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_PROVIDER_EXCLUDED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('provider_id',c.provider_id,'reason','STALE_LOCATION'));
  elsif exists(select 1 from public.delivery_assignments x where x.driver_id=c.provider_id and x.accepted_at is not null and x.completed_at is null)
     or exists(select 1 from public.service_dispatch_assignments x where x.provider_id=c.provider_id and x.completed_at is null) then
   insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_PROVIDER_EXCLUDED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('provider_id',c.provider_id,'reason','INCOMPATIBLE_ACTIVE_ASSIGNMENT'));
  end if;
 end loop;
 select c.* into c from public.get_service_dispatch_candidates(p_job_id,25) c order by c.eta_seconds,c.location_age_seconds,c.compatibility_score,c.provider_id limit 1;
 if c.provider_id is null then
  update public.service_dispatch_jobs set status='EXHAUSTED',updated_at=now() where id=j.id and status='SEARCHING';
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_EXHAUSTED','SERVICE_DISPATCH_JOB',j.id,'{}'::jsonb);
  return null;
 end if;
 insert into public.service_dispatch_offers(job_id,provider_id,expires_at,eta_seconds,location_age_seconds,compatibility_score,expected_job_value,estimated_duration_minutes)
 values(j.id,c.provider_id,now()+make_interval(secs=>cfg.offer_timeout_seconds),c.eta_seconds,c.location_age_seconds,c.compatibility_score,c.expected_job_value,c.estimated_duration_minutes) returning id into oid;
 update public.service_dispatch_jobs set status='PROVIDER_OFFERED',estimated_duration_minutes=coalesce(j.estimated_duration_minutes,c.estimated_duration_minutes),updated_at=now()
 where id=j.id and status='SEARCHING';
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'SERVICE_DISPATCH_PROVIDER_CONSIDERED','SERVICE_DISPATCH_JOB',j.id,jsonb_build_object('provider_id',c.provider_id,'eta_proxy_seconds',c.eta_seconds,'location_age_seconds',c.location_age_seconds)),
 (auth.uid(),'SERVICE_DISPATCH_OFFER_CREATED','SERVICE_DISPATCH_OFFER',oid,jsonb_build_object('job_id',j.id,'provider_id',c.provider_id,'eta_proxy_method','GEOGRAPHIC_PROXY'));
 return oid;
end $$;

create or replace function public.respond_service_dispatch_offer(p_offer_id uuid,p_response text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare o public.service_dispatch_offers; j public.service_dispatch_jobs; r public.service_requests; b public.bookings; q public.quotes; loc public.service_provider_locations; av public.driver_availability; fresh integer; aid uuid; dist numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if upper(trim(p_response)) not in('ACCEPT','DECLINE') then raise exception 'INVALID_OFFER_RESPONSE'; end if;
 select * into o from public.service_dispatch_offers where id=p_offer_id for update;
 if o.id is null or o.provider_id<>auth.uid() then raise exception 'Not authorized'; end if;
 select * into j from public.service_dispatch_jobs where id=o.job_id for update;
 if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
 if j.status='ASSIGNED' or j.claimed_provider_id is not null then return jsonb_build_object('ok',false,'code','JOB_ALREADY_ASSIGNED'); end if;
 if j.status<>'PROVIDER_OFFERED' or o.status<>'OFFERED' then return jsonb_build_object('ok',false,'code','OFFER_NO_LONGER_AVAILABLE'); end if;
 if o.expires_at<=now() then
  update public.service_dispatch_offers set status='EXPIRED',responded_at=now() where id=o.id and status='OFFERED';
  update public.service_dispatch_jobs set status='SEARCHING',updated_at=now() where id=j.id and status='PROVIDER_OFFERED';
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_OFFER_EXPIRED','SERVICE_DISPATCH_OFFER',o.id,jsonb_build_object('job_id',j.id));
  perform public.dispatch_next_service_provider(j.id); return jsonb_build_object('ok',false,'code','OFFER_NO_LONGER_AVAILABLE');
 end if;
 if upper(trim(p_response))='DECLINE' then
  update public.service_dispatch_offers set status='DECLINED',responded_at=now() where id=o.id and status='OFFERED';
  update public.service_dispatch_jobs set status='SEARCHING',updated_at=now() where id=j.id and status='PROVIDER_OFFERED';
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SERVICE_DISPATCH_OFFER_DECLINED','SERVICE_DISPATCH_OFFER',o.id,jsonb_build_object('job_id',j.id));
  perform public.dispatch_next_service_provider(j.id); return jsonb_build_object('ok',true,'code','DECLINED');
 end if;
 if not public.dispatch_driver_is_operational(auth.uid()) then return jsonb_build_object('ok',false,'code','PROVIDER_NOT_OPERATIONAL'); end if;
 select * into av from public.driver_availability where driver_id=auth.uid();
 if av.status<>'ONLINE' then return jsonb_build_object('ok',false,'code','PROVIDER_NOT_ONLINE'); end if;
 select * into loc from public.service_provider_locations where provider_id=auth.uid();
 if loc.provider_id is null then return jsonb_build_object('ok',false,'code','LOCATION_UNAVAILABLE'); end if;
 select greatest(0,extract(epoch from(now()-loc.recorded_at)))::integer into fresh;
 if fresh>(select location_freshness_seconds from public.service_dispatch_config where id=true) then return jsonb_build_object('ok',false,'code','LOCATION_STALE'); end if;
 select * into r from public.service_requests where id=j.request_id for update;
 select * into b from public.bookings where request_id=r.id order by created_at desc limit 1 for update;
 if r.status<>'BOOKED' or b.status<>'CONFIRMED' or b.quote_id is null then return jsonb_build_object('ok',false,'code','JOB_NO_LONGER_DISPATCHABLE'); end if;
 select * into q from public.quotes where id=b.quote_id;
 if q.id is null or q.status<>'ACCEPTED' or q.request_id<>r.id then return jsonb_build_object('ok',false,'code','JOB_NO_LONGER_DISPATCHABLE'); end if;
 if not exists(select 1 from public.service_provider_capabilities where provider_id=auth.uid() and service_id=r.service_id) then return jsonb_build_object('ok',false,'code','PROVIDER_NOT_CAPABLE'); end if;
 dist:=6371.0088*2*asin(sqrt(power(sin(radians(loc.latitude-r.latitude)/2),2)+cos(radians(r.latitude))*cos(radians(loc.latitude))*power(sin(radians(loc.longitude-r.longitude)/2),2)));
 if dist>av.service_radius_km then return jsonb_build_object('ok',false,'code','PROVIDER_OUTSIDE_SERVICE_RADIUS'); end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.delivery_assignments where driver_id=auth.uid() and accepted_at is not null and completed_at is null)
 or exists(select 1 from public.service_dispatch_assignments where provider_id=auth.uid() and completed_at is null)
 then return jsonb_build_object('ok',false,'code','PROVIDER_HAS_INCOMPATIBLE_ACTIVE_ASSIGNMENT'); end if;
 insert into public.service_dispatch_assignments(job_id,service_request_id,booking_id,provider_id,scheduled_start_at,scheduled_end_at)
 values(j.id,r.id,b.id,auth.uid(),j.scheduled_start_at,case when j.scheduled_start_at is null or j.estimated_duration_minutes is null then null else j.scheduled_start_at+make_interval(mins=>j.estimated_duration_minutes) end)
 returning id into aid;
 update public.service_dispatch_offers set status='ACCEPTED',responded_at=now() where id=o.id and status='OFFERED';
 update public.service_dispatch_jobs set status='ACCEPTED',claimed_provider_id=auth.uid(),claimed_at=now(),updated_at=now() where id=j.id and status='PROVIDER_OFFERED';
 if not found then raise exception 'JOB_ALREADY_ASSIGNED'; end if;
 update public.service_dispatch_jobs set status='ASSIGNED',updated_at=now() where id=j.id and status='ACCEPTED';
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'SERVICE_DISPATCH_OFFER_ACCEPTED','SERVICE_DISPATCH_OFFER',o.id,jsonb_build_object('job_id',j.id)),
 (auth.uid(),'SERVICE_DISPATCH_ASSIGNMENT_CREATED','SERVICE_DISPATCH_ASSIGNMENT',aid,jsonb_build_object('job_id',j.id,'request_id',r.id,'booking_id',b.id,'provider_id',auth.uid()));
 return jsonb_build_object('ok',true,'code','ASSIGNED','job_id',j.id,'assignment_id',aid);
exception when unique_violation then return jsonb_build_object('ok',false,'code','JOB_ALREADY_ASSIGNED');
end $$;

revoke all on function public.cancel_service_dispatch_on_marketplace_change() from public,anon,authenticated;
grant execute on function public.cancel_service_dispatch_on_marketplace_change() to service_role;
