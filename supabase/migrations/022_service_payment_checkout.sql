-- Service booking deposit payments use a separate payment ledger because product orders
-- are represented by public.payments/order_id. The booking itself remains authoritative
-- for service lifecycle state.
create table if not exists public.service_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'aud' check (currency='aud'),
  status text not null default 'PENDING' check (status in ('PENDING','SUCCEEDED','FAILED','REFUNDED')),
  idempotency_key text not null unique,
  provider_payment_id text,
  provider_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_payments_booking_idx on public.service_payments(booking_id,created_at desc);
create index if not exists service_payments_customer_idx on public.service_payments(customer_id,created_at desc);

alter table public.service_payments enable row level security;
create policy service_payments_customer_read on public.service_payments
for select using (customer_id=auth.uid());
create policy service_payments_business_read on public.service_payments
for select using (exists(select 1 from public.bookings b where b.id=booking_id and public.is_business_member(b.business_id)) or public.is_admin());
revoke insert,update,delete on public.service_payments from anon,authenticated;

create or replace function public.create_service_payment(p_booking_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.bookings; q public.quotes; p public.service_payments; payment_id uuid; amount numeric;
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
   return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true);
 end if;

 select * into p from public.service_payments where booking_id=b.id and status='PENDING' order by created_at desc limit 1 for update;
 if p.id is not null then
   return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true);
 end if;

 insert into public.service_payments(booking_id,quote_id,customer_id,amount,idempotency_key)
 values(b.id,q.id,auth.uid(),amount,p_idempotency_key)
 returning * into p;
 return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'provider_checkout_session_id',null,'reused',false);
end; $$;
revoke execute on function public.create_service_payment(uuid,text) from anon;
grant execute on function public.create_service_payment(uuid,text) to authenticated;

create or replace function public.process_stripe_service_success(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.service_payments; b public.bookings;
begin
 select * into p from public.service_payments where id=p_payment_id for update;
 if p.id is null then raise exception 'Service payment not found'; end if;
 if p.status='SUCCEEDED' then return true; end if;
 if p.status<>'PENDING' then raise exception 'Service payment is not payable'; end if;
 select * into b from public.bookings where id=p.booking_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 if b.customer_id<>p.customer_id or b.quote_id<>p.quote_id then raise exception 'Payment does not match booking'; end if;
 if b.status<>'PENDING_PAYMENT' then raise exception 'Booking is not awaiting payment'; end if;
 update public.service_payments set status='SUCCEEDED',updated_at=now() where id=p.id;
 update public.bookings set status='CONFIRMED',updated_at=now() where id=b.id and status='PENDING_PAYMENT';
 insert into public.notifications(user_id,kind,title,body,data)
 values((select owner_id from public.businesses where id=b.business_id),'BOOKING_CONFIRMED','Booking payment confirmed','A customer payment confirmed a service booking.',jsonb_build_object('booking_id',b.id));
 return true;
end; $$;
revoke execute on function public.process_stripe_service_success(uuid) from anon,authenticated;
grant execute on function public.process_stripe_service_success(uuid) to service_role;

create or replace function public.process_stripe_service_failure(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.service_payments;
begin
 select * into p from public.service_payments where id=p_payment_id for update;
 if p.id is null then raise exception 'Service payment not found'; end if;
 if p.status='SUCCEEDED' then return true; end if;
 if p.status='FAILED' then return true; end if;
 update public.service_payments set status='FAILED',updated_at=now() where id=p.id and status='PENDING';
 return true;
end; $$;
revoke execute on function public.process_stripe_service_failure(uuid) from anon,authenticated;
grant execute on function public.process_stripe_service_failure(uuid) to service_role;
