-- Instant booking must obey the same marketplace payment authority as quoted jobs.

create or replace function public.instant_book_service(
  p_service_id uuid,
  p_starts_at timestamptz,
  p_suburb text,
  p_city text,
  p_state text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.services;
  b public.businesses;
  cfg public.business_booking_settings;
  ss public.service_booking_settings;
  ends_at timestamptz;
  rid uuid;
  qid uuid;
  bid uuid;
  active_count integer;
  minimum_deposit numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select svc.* into s
  from public.services svc
  where svc.id=p_service_id
  for update;

  if s.id is null or not s.active or s.base_price is null or s.base_price<=0 then
    raise exception 'This service is not available for instant booking';
  end if;

  select * into b
  from public.businesses
  where id=s.business_id
    and status='ACTIVE'
    and verification_status='VERIFIED'
    and accepts_requests;

  select * into cfg
  from public.business_booking_settings
  where business_id=s.business_id
  for update;

  select * into ss
  from public.service_booking_settings
  where service_id=s.id;

  if b.id is null
     or not coalesce(cfg.instant_booking_enabled,false)
     or not coalesce(ss.instant_booking_enabled,false) then
    raise exception 'Instant booking is not enabled for this service';
  end if;

  if not public.is_business_payment_ready(s.business_id) then
    raise exception 'This business is not ready to receive Everest payments';
  end if;

  if p_starts_at<now()+make_interval(mins=>cfg.minimum_advance_minutes)
     or p_starts_at>now()+make_interval(days=>cfg.maximum_booking_days)
     or (
       not cfg.same_day_enabled
       and (p_starts_at at time zone cfg.timezone)::date=(now() at time zone cfg.timezone)::date
     ) then
    raise exception 'This slot is no longer available';
  end if;

  ends_at:=p_starts_at+make_interval(mins=>coalesce(s.duration_minutes,60)+cfg.buffer_minutes);

  if not exists(
    select 1
    from jsonb_array_elements(
      coalesce(cfg.weekly_hours->to_char(p_starts_at at time zone cfg.timezone,'ID'),'[]'::jsonb)
    ) w
    where (p_starts_at at time zone cfg.timezone)::time >= (w->>'start')::time
      and (ends_at at time zone cfg.timezone)::time <= (w->>'end')::time
  ) then
    raise exception 'This slot is outside the business working hours';
  end if;

  if exists(
    select 1 from public.crm_calendar_blocks x
    where x.business_id=s.business_id
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(p_starts_at,ends_at,'[)')
  ) or exists(
    select 1 from public.external_calendar_busy_blocks x
    where x.business_id=s.business_id
      and x.status='BUSY'
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(p_starts_at,ends_at,'[)')
  ) then
    raise exception 'This slot is no longer available';
  end if;

  select count(*) into active_count
  from public.instant_booking_slots x
  join public.bookings bk on bk.id=x.booking_id
  where x.business_id=s.business_id
    and bk.status not in ('CANCELLED','DISPUTED')
    and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(p_starts_at,ends_at,'[)');

  if active_count>=cfg.capacity then raise exception 'This slot has just been taken'; end if;

  if nullif(trim(coalesce(p_suburb,'')),'') is null
     or nullif(trim(coalesce(p_city,'')),'') is null
     or nullif(trim(coalesce(p_state,'')),'') is null then
    raise exception 'A service location is required';
  end if;

  if s.delivery_mode='LOCAL' and not exists(
    select 1
    from public.service_areas a
    where a.business_id=s.business_id
      and a.active
      and lower(a.suburb)=lower(trim(p_suburb))
      and lower(a.city)=lower(trim(p_city))
      and lower(a.state)=lower(trim(p_state))
  ) then
    raise exception 'This business does not service that location';
  end if;

  minimum_deposit:=least(s.base_price,public.calculate_service_platform_fee(s.base_price));

  insert into public.service_requests(
    customer_id,category_id,service_id,delivery_mode,description,
    suburb,city,state,preferred_date,preferred_time,budget,status
  )
  values(
    auth.uid(),s.category_id,s.id,s.delivery_mode,'Instant booking: '||s.name,
    nullif(trim(p_suburb),''),nullif(trim(p_city),''),nullif(trim(p_state),''),
    (p_starts_at at time zone cfg.timezone)::date,
    (p_starts_at at time zone cfg.timezone)::time,
    s.base_price,'BOOKED'
  )
  returning id into rid;

  insert into public.quotes(
    request_id,business_id,customer_id,service_id,description,
    price,deposit,total,proposed_date,proposed_time,status
  )
  values(
    rid,s.business_id,auth.uid(),s.id,'Instant booking: '||s.name,
    s.base_price,minimum_deposit,s.base_price,
    (p_starts_at at time zone cfg.timezone)::date,
    (p_starts_at at time zone cfg.timezone)::time,
    'ACCEPTED'
  )
  returning id into qid;

  insert into public.bookings(
    request_id,quote_id,customer_id,business_id,price,
    scheduled_date,scheduled_time,status,marketplace_payment_required
  )
  values(
    rid,qid,auth.uid(),s.business_id,s.base_price,
    (p_starts_at at time zone cfg.timezone)::date,
    (p_starts_at at time zone cfg.timezone)::time,
    'PENDING_PAYMENT',true
  )
  returning id into bid;

  insert into public.instant_booking_slots(
    booking_id,service_id,business_id,starts_at,ends_at
  )
  values(bid,s.id,s.business_id,p_starts_at,ends_at);

  insert into public.notifications(user_id,kind,title,body,data)
  values(
    b.owner_id,
    'INSTANT_BOOKING_CONFIRMED',
    'Instant booking awaiting payment',
    s.name||' was reserved and is awaiting the customer payment.',
    jsonb_build_object('booking_id',bid,'service_id',s.id,'payment_required',true)
  );

  return bid;
end
$$;

revoke all on function public.instant_book_service(uuid,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.instant_book_service(uuid,timestamptz,text,text,text,text) to authenticated;
