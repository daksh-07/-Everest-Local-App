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