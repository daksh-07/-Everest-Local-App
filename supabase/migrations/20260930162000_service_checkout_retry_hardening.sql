-- Prevent payout-disabled businesses from leaving reusable PENDING service-payment
-- attempts without a Stripe Checkout Session.

create or replace function public.create_service_payment(
  p_booking_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  b public.bookings;
  q public.quotes;
  p public.service_payments;
  amount numeric;
  paid numeric;
  remaining numeric;
  next_kind text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,''))<16 or length(p_idempotency_key)>128 then
    raise exception 'Invalid idempotency key';
  end if;

  select * into b
  from public.bookings
  where id=p_booking_id and customer_id=auth.uid()
  for update;

  if b.id is null then raise exception 'Booking not found'; end if;
  if b.status in ('CANCELLED','COMPLETED','DISPUTED') then
    raise exception 'This booking cannot accept another payment';
  end if;
  if b.status not in ('PENDING_PAYMENT','CONFIRMED','UPCOMING','IN_PROGRESS') then
    raise exception 'Booking is not payable';
  end if;

  if not public.is_business_payment_ready(b.business_id) then
    raise exception 'This business is not ready to receive Everest payments';
  end if;

  select * into q
  from public.quotes
  where id=b.quote_id
  for update;

  if q.id is null or q.customer_id<>auth.uid() or q.status<>'ACCEPTED' then
    raise exception 'Accepted quote not found';
  end if;

  select coalesce(sum(sp.amount),0)
  into paid
  from public.service_payments sp
  where sp.booking_id=b.id and sp.status='SUCCEEDED';

  remaining:=round(greatest(q.total-paid,0),2);
  if remaining<=0 then raise exception 'This booking is already fully paid'; end if;

  select * into p
  from public.service_payments
  where idempotency_key=p_idempotency_key
  for update;

  if p.id is not null then
    if p.customer_id<>auth.uid() or p.booking_id<>b.id then
      raise exception 'Idempotency key belongs to another checkout attempt';
    end if;
    return jsonb_build_object(
      'payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,
      'currency',p.currency,'payment_kind',p.payment_kind,
      'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true
    );
  end if;

  select * into p
  from public.service_payments
  where booking_id=b.id and status='PENDING'
  order by created_at desc
  limit 1
  for update;

  if p.id is not null then
    return jsonb_build_object(
      'payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,
      'currency',p.currency,'payment_kind',p.payment_kind,
      'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true
    );
  end if;

  if paid<=0 then
    amount:=round(least(q.deposit,remaining),2);
    next_kind:='DEPOSIT';
  else
    amount:=remaining;
    next_kind:='BALANCE';
  end if;

  if amount<=0 then raise exception 'No payment is required for this booking'; end if;

  insert into public.service_payments(
    booking_id,quote_id,customer_id,amount,idempotency_key,payment_kind
  )
  values(
    b.id,q.id,auth.uid(),amount,p_idempotency_key,next_kind
  )
  returning * into p;

  return jsonb_build_object(
    'payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,
    'currency',p.currency,'payment_kind',p.payment_kind,
    'provider_checkout_session_id',null,'reused',false
  );
end
$$;

revoke all on function public.create_service_payment(uuid,text) from public,anon;
grant execute on function public.create_service_payment(uuid,text) to authenticated;
