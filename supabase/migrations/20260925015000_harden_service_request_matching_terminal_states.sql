-- Prevent a customer from re-running matching against a terminal request and
-- regressing BOOKED / COMPLETED / CANCELLED back to QUOTING.
-- The row lock also serializes concurrent matching attempts for one request.

create or replace function public.match_service_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.service_requests;
  inserted_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into r
  from public.service_requests
  where id=p_request_id
  for update;

  if r.id is null or (r.customer_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if r.status not in ('OPEN','MATCHING','QUOTING') then
    raise exception 'Request is no longer eligible for matching';
  end if;

  update public.service_requests
  set status='MATCHING',updated_at=now()
  where id=r.id;

  insert into public.service_matches(request_id,business_id,score,reason)
  select r.id,b.id,
    (case when b.verification_status='VERIFIED' then 40 else 0 end) +
    (case when b.category_id=r.category_id then 30 else 0 end) +
    (case when svc.id is not null then 20 else 0 end) +
    (case when area.id is not null then 10 else 0 end),
    jsonb_build_object(
      'verified',true,
      'category_match',b.category_id=r.category_id,
      'service_match',svc.id is not null,
      'area_match',area.id is not null,
      'delivery_mode',r.delivery_mode
    )
  from public.businesses b
  join public.services svc on svc.business_id=b.id and svc.active
    and (r.service_id is null or svc.id=r.service_id)
    and (svc.delivery_mode=r.delivery_mode or svc.delivery_mode='BOTH')
  left join public.service_areas area on area.business_id=b.id and area.active
    and r.delivery_mode='LOCAL'
    and r.state is not null and r.city is not null and r.suburb is not null
    and lower(area.state)=lower(r.state)
    and lower(area.city)=lower(r.city)
    and lower(area.suburb)=lower(r.suburb)
  where b.status='ACTIVE'
    and b.verification_status='VERIFIED'
    and b.accepts_requests
    and (r.delivery_mode='REMOTE' or area.id is not null)
    and (r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id)
  on conflict(request_id,business_id) do update
    set score=excluded.score,reason=excluded.reason;

  insert into public.opportunities(request_id,business_id,expires_at)
  select request_id,business_id,now()+interval '48 hours'
  from public.service_matches
  where request_id=r.id
  on conflict(request_id,business_id) do nothing;

  get diagnostics inserted_count=row_count;

  update public.service_requests
  set status='QUOTING',updated_at=now()
  where id=r.id;

  return inserted_count;
end;
$$;

revoke all on function public.match_service_request(uuid) from public, anon;
grant execute on function public.match_service_request(uuid) to authenticated;
