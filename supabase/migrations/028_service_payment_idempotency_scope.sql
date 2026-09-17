-- An idempotency key is scoped to the authenticated customer's exact booking attempt.
-- Never return another customer's or another booking's payment record merely because a key matches.

create or replace function public.create_service_payment(p_booking_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.bookings; q public.quotes; p public.service_payments; amount numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(coalesce(p_idempotency_key,''))<16 or length(p_idempotency_key)>128 then raise exception 'Invalid idempotency key'; end if;
 select * into b from public.bookings where id=p_booking_id and customer_id=auth.uid() for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 if b.status='CONFIRMED' then raise exception 'Booking is already paid'; end if;
 if b.status<>'PENDING_PAYMENT' then raise exception 'Booking is not awaiting payment'; end if;
 select * into q from public.quotes where id=b.quote_id for update;
 if q.id is null or q.customer_id<>auth.uid() or q.status<>'ACCEPTED' then raise exception 'Accepted quote not found'; end if;
 amount:=round(q.deposit,2);
 if amount<=0 then raise exception 'No payment is required for this booking'; end if;

 select * into p from public.service_payments where idempotency_key=p_idempotency_key for update;
 if p.id is not null then
   if p.customer_id<>auth.uid() or p.booking_id<>b.id then raise exception 'Idempotency key belongs to another checkout attempt'; end if;
   return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true);
 end if;

 select * into p from public.service_payments where booking_id=b.id and status='PENDING' order by created_at desc limit 1 for update;
 if p.id is not null then
   return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true);
 end if;

 insert into public.service_payments(booking_id,quote_id,customer_id,amount,idempotency_key)
 values(b.id,q.id,auth.uid(),amount,p_idempotency_key) returning * into p;
 return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'provider_checkout_session_id',null,'reused',false);
end; $$;

revoke execute on function public.create_service_payment(uuid,text) from anon;
grant execute on function public.create_service_payment(uuid,text) to authenticated;
