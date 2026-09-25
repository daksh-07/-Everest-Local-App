-- Fix dispatch lifecycle trigger record access used by request matching.
-- The previous CASE expression referenced NEW.request_id even on service_requests rows,
-- causing create_service_request_v2 -> match_service_request to fail at runtime.

create or replace function public.cancel_service_dispatch_on_marketplace_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  j public.service_dispatch_jobs;
  v_request uuid;
  v_status text;
begin
  if TG_TABLE_NAME='bookings' then
    v_request:=NEW.request_id;
    v_status:=NEW.status::text;
  elsif TG_TABLE_NAME='service_requests' then
    v_request:=NEW.id;
    v_status:=NEW.status::text;
  else
    raise exception 'Unsupported trigger table %', TG_TABLE_NAME;
  end if;

  select * into j
  from public.service_dispatch_jobs
  where request_id=v_request
  for update;

  if j.id is not null and j.status not in('ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED','EXHAUSTED') then
    if (TG_TABLE_NAME='service_requests' and v_status<>'BOOKED')
       or (TG_TABLE_NAME='bookings' and v_status<>'CONFIRMED') then
      update public.service_dispatch_jobs
      set status='CANCELLED',updated_at=now()
      where id=j.id;

      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values(
        null,'SERVICE_DISPATCH_CANCELLED','SERVICE_DISPATCH_JOB',j.id,
        jsonb_build_object('request_id',v_request,'source_table',TG_TABLE_NAME,'source_status',v_status)
      );
    end if;
  end if;
  return NEW;
end $$;

revoke all on function public.cancel_service_dispatch_on_marketplace_change() from public,anon,authenticated;
