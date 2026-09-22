-- Repair the dispatch client contract after the legacy provider profile table was removed.
-- Client reads remain constrained by the existing ownership RLS policies.
grant select on table public.service_provider_capabilities to authenticated;
grant select on table public.service_provider_locations to authenticated;
grant select on table public.service_dispatch_jobs to authenticated;
grant select on table public.service_dispatch_offers to authenticated;
grant select on table public.service_dispatch_assignments to authenticated;

create or replace function public.set_service_provider_capability(p_service_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.dispatch_driver_is_operational(uid) then raise exception 'DRIVER_NOT_OPERATIONAL'; end if;
  if not exists(
    select 1 from public.services s
    join public.businesses b on b.id=s.business_id
    join public.business_members bm on bm.business_id=b.id
    where s.id=p_service_id and s.active and bm.user_id=uid
      and b.status='ACTIVE' and b.verification_status='VERIFIED'
  ) then raise exception 'VERIFIED_BUSINESS_SERVICE_REQUIRED'; end if;
  if p_enabled then
    insert into public.service_provider_capabilities(provider_id,service_id)
    values(uid,p_service_id) on conflict do nothing;
  else
    delete from public.service_provider_capabilities where provider_id=uid and service_id=p_service_id;
  end if;
  return true;
end;
$$;
revoke all on function public.set_service_provider_capability(uuid,boolean) from public,anon;
grant execute on function public.set_service_provider_capability(uuid,boolean) to authenticated;

create or replace function public.update_my_service_dispatch_assignment(p_assignment_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  assignment public.service_dispatch_assignments;
  job public.service_dispatch_jobs;
  action text := upper(trim(p_action));
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if action not in ('START','COMPLETE') then raise exception 'INVALID_ASSIGNMENT_ACTION'; end if;
  select * into assignment from public.service_dispatch_assignments
    where id=p_assignment_id and provider_id=uid for update;
  if assignment.id is null then raise exception 'Not authorized'; end if;
  select * into job from public.service_dispatch_jobs where id=assignment.job_id for update;
  if job.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if action='START' then
    if assignment.completed_at is not null or assignment.started_at is not null or job.status<>'ASSIGNED'
      then return jsonb_build_object('ok',false,'code','ASSIGNMENT_NO_LONGER_STARTABLE'); end if;
    update public.service_dispatch_assignments set started_at=now() where id=assignment.id;
    update public.service_dispatch_jobs set status='IN_PROGRESS',updated_at=now() where id=job.id and status='ASSIGNED';
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values(uid,'SERVICE_DISPATCH_ASSIGNMENT_STARTED','SERVICE_DISPATCH_ASSIGNMENT',assignment.id,jsonb_build_object('job_id',job.id));
    return jsonb_build_object('ok',true,'code','IN_PROGRESS');
  end if;
  if assignment.completed_at is not null then return jsonb_build_object('ok',true,'code','COMPLETED'); end if;
  if assignment.started_at is null or job.status<>'IN_PROGRESS'
    then return jsonb_build_object('ok',false,'code','ASSIGNMENT_NOT_IN_PROGRESS'); end if;
  update public.service_dispatch_assignments set completed_at=now() where id=assignment.id and completed_at is null;
  update public.service_dispatch_jobs set status='COMPLETED',updated_at=now() where id=job.id and status='IN_PROGRESS';
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(uid,'SERVICE_DISPATCH_ASSIGNMENT_COMPLETED','SERVICE_DISPATCH_ASSIGNMENT',assignment.id,jsonb_build_object('job_id',job.id));
  return jsonb_build_object('ok',true,'code','COMPLETED');
end;
$$;
revoke all on function public.update_my_service_dispatch_assignment(uuid,text) from public,anon;
grant execute on function public.update_my_service_dispatch_assignment(uuid,text) to authenticated;
