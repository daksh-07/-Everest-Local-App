-- Phase 7: serialize customer quote decisions request-first.
-- Financial validation, deposit/fee calculation, pending-payment booking creation,
-- notifications and all existing state guards below the lock block are unchanged.
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

  -- Resolve ownership and the request without locking a competing quote.
  select * into q from public.quotes where id=p_quote_id;
  if q.id is null or q.customer_id<>auth.uid() then raise exception 'Not authorized'; end if;

  select * into r from public.service_requests where id=q.request_id for update;
  if r.id is null or r.customer_id<>auth.uid() then raise exception 'Request not found'; end if;

  -- All quote decisions serialize on the request before acquiring quote locks.
  -- Re-read under lock and revalidate after waiting: the initial lookup is not authority.
  select * into q from public.quotes where id=p_quote_id for update;
  if q.id is null or q.customer_id<>auth.uid() or q.request_id is distinct from r.id then
    raise exception 'Not authorized';
  end if;
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

revoke all on function public.accept_quote(uuid) from public,anon;
grant execute on function public.accept_quote(uuid) to authenticated;
