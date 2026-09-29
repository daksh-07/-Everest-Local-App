-- Harden marketplace quote creation/acceptance against inactive staff and
-- businesses that cannot receive live Stripe payments.

create or replace function public.send_quote_for_business(
  p_business_id uuid,p_request_id uuid,p_service_id uuid,p_description text,p_line_items jsonb,p_price numeric,
  p_deposit numeric,p_total numeric,p_proposed_date date,p_proposed_time time without time zone,
  p_valid_until timestamp with time zone,p_terms text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_quote_id uuid;
  v_customer_id uuid;
  v_request_status public.request_status;
  v_minimum_deposit numeric;
  v_effective_deposit numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  if not (
    public.has_business_permission(p_business_id,'JOB_UPDATE_ALL')
    or public.has_business_permission(p_business_id,'CRM_MANAGE')
  ) then
    raise exception 'Business quote permission denied';
  end if;

  if not public.is_business_payment_ready(p_business_id) then
    raise exception 'Set up Stripe payouts before sending marketplace quotes';
  end if;

  select r.customer_id,r.status
  into v_customer_id,v_request_status
  from public.service_requests r
  where r.id=p_request_id
  for update;

  if v_customer_id is null then raise exception 'Request not found'; end if;
  if v_request_status<>'QUOTING' then raise exception 'Request is not accepting quotes'; end if;

  if not exists(
    select 1 from public.opportunities o
    where o.request_id=p_request_id
      and o.business_id=p_business_id
      and o.status='OPEN'
    for update
  ) then
    raise exception 'No authorized opportunity';
  end if;

  if p_service_id is not null and not exists(
    select 1 from public.services s
    where s.id=p_service_id and s.business_id=p_business_id and s.active
  ) then
    raise exception 'Selected service is not owned and active for this business';
  end if;

  if p_price is null or p_deposit is null or p_total is null
     or p_price<0 or p_deposit<0 or p_total<=0 or p_total<p_deposit then
    raise exception 'Invalid quote amounts';
  end if;

  if p_valid_until is not null and p_valid_until<=now() then
    raise exception 'Quote expiry must be in the future';
  end if;

  v_minimum_deposit:=least(p_total,public.calculate_service_platform_fee(p_total));
  v_effective_deposit:=greatest(round(p_deposit,2),v_minimum_deposit);
  if v_effective_deposit>p_total then v_effective_deposit:=p_total; end if;

  insert into public.quotes(
    request_id,business_id,customer_id,service_id,description,line_items,
    price,deposit,total,proposed_date,proposed_time,valid_until,terms,status
  )
  values(
    p_request_id,p_business_id,v_customer_id,p_service_id,trim(coalesce(p_description,'')),
    coalesce(p_line_items,'[]'::jsonb),p_price,v_effective_deposit,p_total,p_proposed_date,
    p_proposed_time,p_valid_until,p_terms,'SENT'
  )
  returning id into v_quote_id;

  update public.opportunities
  set status='RESPONDED'
  where request_id=p_request_id and business_id=p_business_id and status='OPEN';

  insert into public.notifications(user_id,kind,title,body,data)
  values(
    v_customer_id,'NEW_QUOTE','New quote received','A business has sent you a quote.',
    jsonb_build_object('quote_id',v_quote_id,'request_id',p_request_id,'business_id',p_business_id)
  );

  return v_quote_id;
end
$$;

create or replace function public.send_quote(
  p_request_id uuid,p_service_id uuid,p_description text,p_line_items jsonb,p_price numeric,
  p_deposit numeric,p_total numeric,p_proposed_date date,p_proposed_time time without time zone,
  p_valid_until timestamp with time zone,p_terms text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select o.business_id into v_business_id
  from public.opportunities o
  where o.request_id=p_request_id
    and o.status='OPEN'
    and (
      public.has_business_permission(o.business_id,'JOB_UPDATE_ALL')
      or public.has_business_permission(o.business_id,'CRM_MANAGE')
    )
  order by o.created_at asc
  limit 1;

  if v_business_id is null then raise exception 'No authorized opportunity'; end if;

  return public.send_quote_for_business(
    v_business_id,p_request_id,p_service_id,p_description,p_line_items,p_price,p_deposit,p_total,
    p_proposed_date,p_proposed_time,p_valid_until,p_terms
  );
end
$$;

create or replace function public.accept_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  q public.quotes;
  r public.service_requests;
  bid uuid;
  minimum_deposit numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into q from public.quotes where id=p_quote_id for update;
  if q.id is null or q.customer_id<>auth.uid() then raise exception 'Not authorized'; end if;

  select * into r from public.service_requests where id=q.request_id for update;
  if r.id is null or r.customer_id<>auth.uid() then raise exception 'Request not found'; end if;
  if r.status<>'QUOTING' then raise exception 'This request is no longer accepting quote decisions'; end if;
  if q.status not in ('SENT','VIEWED') then raise exception 'Quote cannot be accepted in its current state'; end if;

  if q.valid_until is not null and q.valid_until<now() then
    update public.quotes set status='EXPIRED',updated_at=now() where id=q.id;
    raise exception 'Quote expired';
  end if;

  if not public.is_business_payment_ready(q.business_id) then
    raise exception 'This business is not ready to receive Everest payments. Choose another quote or try again later';
  end if;

  minimum_deposit:=least(q.total,public.calculate_service_platform_fee(q.total));
  if q.deposit<minimum_deposit then
    update public.quotes set deposit=minimum_deposit,updated_at=now() where id=q.id;
    q.deposit:=minimum_deposit;
  end if;

  update public.quotes set status='ACCEPTED',updated_at=now() where id=q.id;
  update public.quotes set status='DECLINED',updated_at=now()
  where request_id=q.request_id and id<>q.id and status in ('SENT','VIEWED');

  insert into public.bookings(
    request_id,quote_id,customer_id,business_id,price,
    scheduled_date,scheduled_time,status,marketplace_payment_required
  )
  values(
    q.request_id,q.id,q.customer_id,q.business_id,q.total,
    q.proposed_date,q.proposed_time,'PENDING_PAYMENT',true
  )
  returning id into bid;

  update public.service_requests set status='BOOKED',updated_at=now() where id=q.request_id;

  insert into public.notifications(user_id,kind,title,body,data)
  values(
    (select owner_id from public.businesses where id=q.business_id),
    'QUOTE_ACCEPTED','Quote accepted',
    'A customer accepted your quote. The booking is secured after the Everest deposit is paid.',
    jsonb_build_object('quote_id',q.id,'booking_id',bid)
  );

  return bid;
end
$$;

revoke all on function public.send_quote_for_business(uuid,uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) from public,anon;
grant execute on function public.send_quote_for_business(uuid,uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) to authenticated;

revoke all on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) from public,anon;
grant execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) to authenticated;

revoke all on function public.accept_quote(uuid) from public,anon;
grant execute on function public.accept_quote(uuid) to authenticated;
