-- Marketplace service-payment leakage controls.
-- Everest-originated jobs must settle their full quoted balance through Everest.
-- The full marketplace fee is reserved from provider proceeds as early as possible.

alter table public.bookings
  add column if not exists marketplace_payment_required boolean not null default false;

update public.bookings
set marketplace_payment_required=true
where request_id is not null;

alter table public.service_payments
  add column if not exists payment_kind text not null default 'DEPOSIT'
    check (payment_kind in ('DEPOSIT','BALANCE'));

create table if not exists public.payment_circumvention_flags (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN','REVIEWED','DISMISSED','ACTIONED')),
  created_at timestamptz not null default now(),
  unique(message_id)
);

create index if not exists payment_circumvention_flags_business_idx
  on public.payment_circumvention_flags(business_id,created_at desc);

alter table public.payment_circumvention_flags enable row level security;
drop policy if exists payment_circumvention_flags_admin_read on public.payment_circumvention_flags;
create policy payment_circumvention_flags_admin_read
on public.payment_circumvention_flags for select to authenticated
using (public.is_admin());

revoke all on public.payment_circumvention_flags from anon,authenticated;
grant select on public.payment_circumvention_flags to authenticated;

create or replace function public.send_quote(
  p_request_id uuid,p_service_id uuid,p_description text,p_line_items jsonb,p_price numeric,
  p_deposit numeric,p_total numeric,p_proposed_date date,p_proposed_time time without time zone,
  p_valid_until timestamp with time zone,p_terms text
) returns uuid language plpgsql security definer set search_path='' as $$
declare qid uuid;bid uuid;cid uuid;request_status public.request_status;verified boolean;minimum_deposit numeric;effective_deposit numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  select r.customer_id,r.status into cid,request_status from public.service_requests r where r.id=p_request_id for update;
  if cid is null then raise exception 'Request not found';end if;
  if request_status<>'QUOTING' then raise exception 'Request is not accepting quotes';end if;

  select o.business_id into bid from public.opportunities o
  where o.request_id=p_request_id
    and o.business_id in(select bm.business_id from public.business_members bm where bm.user_id=auth.uid())
    and o.status='OPEN'
  order by o.created_at asc limit 1 for update;
  if bid is null then raise exception 'No authorized opportunity';end if;

  select b.verification_status='VERIFIED' into verified from public.businesses b where b.id=bid;
  if not coalesce(verified,false) then raise exception 'Verified business access is required';end if;

  if p_service_id is not null and not exists(select 1 from public.services s where s.id=p_service_id and s.business_id=bid and s.active)
  then raise exception 'Selected service is not owned and active for this business';end if;

  if p_price is null or p_deposit is null or p_total is null or p_price<0 or p_deposit<0 or p_total<=0 or p_total<p_deposit
  then raise exception 'Invalid quote amounts';end if;
  if p_valid_until is not null and p_valid_until<=now() then raise exception 'Quote expiry must be in the future';end if;

  minimum_deposit:=least(p_total,public.calculate_service_platform_fee(p_total));
  effective_deposit:=greatest(round(p_deposit,2),minimum_deposit);
  if effective_deposit>p_total then effective_deposit:=p_total;end if;

  insert into public.quotes(request_id,business_id,customer_id,service_id,description,line_items,price,deposit,total,proposed_date,proposed_time,valid_until,terms,status)
  values(p_request_id,bid,cid,p_service_id,trim(coalesce(p_description,'')),coalesce(p_line_items,'[]'::jsonb),p_price,effective_deposit,p_total,p_proposed_date,p_proposed_time,p_valid_until,p_terms,'SENT')
  returning id into qid;

  update public.opportunities set status='RESPONDED' where request_id=p_request_id and business_id=bid and status='OPEN';
  insert into public.notifications(user_id,kind,title,body,data)
  values(cid,'NEW_QUOTE','New quote received','A business has sent you a quote.',jsonb_build_object('quote_id',qid,'request_id',p_request_id));
  return qid;
end $$;

update public.quotes
set deposit=least(total,public.calculate_service_platform_fee(total)),updated_at=now()
where status in ('DRAFT','SENT','VIEWED')
  and deposit<least(total,public.calculate_service_platform_fee(total));

create or replace function public.accept_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path='public' as $$
declare q public.quotes;r public.service_requests;bid uuid;minimum_deposit numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if q.id is null or q.customer_id<>auth.uid() then raise exception 'Not authorized';end if;
  select * into r from public.service_requests where id=q.request_id for update;
  if r.id is null or r.customer_id<>auth.uid() then raise exception 'Request not found';end if;
  if r.status<>'QUOTING' then raise exception 'This request is no longer accepting quote decisions';end if;
  if q.status not in ('SENT','VIEWED') then raise exception 'Quote cannot be accepted in its current state';end if;
  if q.valid_until is not null and q.valid_until<now() then
    update public.quotes set status='EXPIRED',updated_at=now() where id=q.id;
    raise exception 'Quote expired';
  end if;

  minimum_deposit:=least(q.total,public.calculate_service_platform_fee(q.total));
  if q.deposit<minimum_deposit then update public.quotes set deposit=minimum_deposit,updated_at=now() where id=q.id;q.deposit:=minimum_deposit;end if;

  update public.quotes set status='ACCEPTED',updated_at=now() where id=q.id;
  update public.quotes set status='DECLINED',updated_at=now() where request_id=q.request_id and id<>q.id and status in ('SENT','VIEWED');

  insert into public.bookings(request_id,quote_id,customer_id,business_id,price,scheduled_date,scheduled_time,status,marketplace_payment_required)
  values(q.request_id,q.id,q.customer_id,q.business_id,q.total,q.proposed_date,q.proposed_time,'PENDING_PAYMENT',true)
  returning id into bid;

  update public.service_requests set status='BOOKED',updated_at=now() where id=q.request_id;
  insert into public.notifications(user_id,kind,title,body,data)
  values((select owner_id from public.businesses where id=q.business_id),'QUOTE_ACCEPTED','Quote accepted','A customer accepted your quote. The booking is secured after the Everest deposit is paid.',jsonb_build_object('quote_id',q.id,'booking_id',bid));
  return bid;
end $$;

create or replace function public.apply_service_payment_fee()
returns trigger language plpgsql security definer set search_path='' as $$
declare job_total numeric;full_fee numeric;prior_fee numeric;
begin
  select q.total into job_total from public.quotes q where q.id=new.quote_id;
  full_fee:=public.calculate_service_platform_fee(coalesce(job_total,new.amount));
  select coalesce(sum(sp.marketplace_fee),0) into prior_fee
  from public.service_payments sp
  where sp.booking_id=new.booking_id and sp.id is distinct from new.id and sp.status='SUCCEEDED';

  new.marketplace_fee:=round(least(new.amount,greatest(full_fee-prior_fee,0)),2);
  new.provider_net:=round(greatest(new.amount-new.marketplace_fee,0),2);
  new.fee_policy_version:='2026-09-v1';
  return new;
end $$;

drop trigger if exists trg_apply_service_payment_fee on public.service_payments;
create trigger trg_apply_service_payment_fee before insert or update of amount on public.service_payments
for each row execute function public.apply_service_payment_fee();

create or replace function public.create_service_payment(p_booking_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare b public.bookings;q public.quotes;p public.service_payments;amount numeric;paid numeric;remaining numeric;next_kind text;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if length(coalesce(p_idempotency_key,''))<16 or length(p_idempotency_key)>128 then raise exception 'Invalid idempotency key';end if;

  select * into b from public.bookings where id=p_booking_id and customer_id=auth.uid() for update;
  if b.id is null then raise exception 'Booking not found';end if;
  if b.status in ('CANCELLED','COMPLETED','DISPUTED') then raise exception 'This booking cannot accept another payment';end if;
  if b.status not in ('PENDING_PAYMENT','CONFIRMED','UPCOMING','IN_PROGRESS') then raise exception 'Booking is not payable';end if;

  select * into q from public.quotes where id=b.quote_id for update;
  if q.id is null or q.customer_id<>auth.uid() or q.status<>'ACCEPTED' then raise exception 'Accepted quote not found';end if;

  select coalesce(sum(sp.amount),0) into paid from public.service_payments sp where sp.booking_id=b.id and sp.status='SUCCEEDED';
  remaining:=round(greatest(q.total-paid,0),2);
  if remaining<=0 then raise exception 'This booking is already fully paid';end if;

  select * into p from public.service_payments where idempotency_key=p_idempotency_key for update;
  if p.id is not null then
    if p.customer_id<>auth.uid() or p.booking_id<>b.id then raise exception 'Idempotency key belongs to another checkout attempt';end if;
    return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'payment_kind',p.payment_kind,'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true);
  end if;

  select * into p from public.service_payments where booking_id=b.id and status='PENDING' order by created_at desc limit 1 for update;
  if p.id is not null then
    return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'payment_kind',p.payment_kind,'provider_checkout_session_id',p.provider_checkout_session_id,'reused',true);
  end if;

  if paid<=0 then amount:=round(least(q.deposit,remaining),2);next_kind:='DEPOSIT';
  else amount:=remaining;next_kind:='BALANCE';end if;
  if amount<=0 then raise exception 'No payment is required for this booking';end if;

  insert into public.service_payments(booking_id,quote_id,customer_id,amount,idempotency_key,payment_kind)
  values(b.id,q.id,auth.uid(),amount,p_idempotency_key,next_kind) returning * into p;

  return jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'amount',p.amount,'currency',p.currency,'payment_kind',p.payment_kind,'provider_checkout_session_id',null,'reused',false);
end $$;

revoke execute on function public.create_service_payment(uuid,text) from anon;
grant execute on function public.create_service_payment(uuid,text) to authenticated;

create or replace function public.process_stripe_service_success(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path='public' as $$
declare p public.service_payments;b public.bookings;q public.quotes;paid numeric;remaining numeric;
begin
  select * into p from public.service_payments where id=p_payment_id for update;
  if p.id is null then raise exception 'Service payment not found';end if;
  if p.status='SUCCEEDED' then return true;end if;
  if p.status<>'PENDING' then raise exception 'Service payment is not payable';end if;

  select * into b from public.bookings where id=p.booking_id for update;
  if b.id is null then raise exception 'Booking not found';end if;
  if b.customer_id<>p.customer_id or b.quote_id<>p.quote_id then raise exception 'Payment does not match booking';end if;
  if b.status in ('CANCELLED','COMPLETED','DISPUTED') then raise exception 'Booking is no longer payable';end if;

  select * into q from public.quotes where id=p.quote_id;
  if q.id is null then raise exception 'Quote not found';end if;

  update public.service_payments set status='SUCCEEDED',updated_at=now() where id=p.id;
  select coalesce(sum(sp.amount),0) into paid from public.service_payments sp where sp.booking_id=b.id and sp.status='SUCCEEDED';
  remaining:=round(greatest(q.total-paid,0),2);

  if b.status='PENDING_PAYMENT' then update public.bookings set status='CONFIRMED',updated_at=now() where id=b.id and status='PENDING_PAYMENT';end if;

  if remaining<=0 then
    insert into public.notifications(user_id,kind,title,body,data)
    values((select owner_id from public.businesses where id=b.business_id),'SERVICE_FULLY_PAID','Service balance paid','The customer has paid the full Everest booking balance.',jsonb_build_object('booking_id',b.id,'quote_id',q.id,'amount_paid',paid));
  else
    insert into public.notifications(user_id,kind,title,body,data)
    values((select owner_id from public.businesses where id=b.business_id),'BOOKING_CONFIRMED','Booking payment confirmed','The Everest deposit is paid. The remaining balance stays payable in Everest.',jsonb_build_object('booking_id',b.id,'quote_id',q.id,'balance_due',remaining));
  end if;
  return true;
end $$;

revoke execute on function public.process_stripe_service_success(uuid) from anon,authenticated;
grant execute on function public.process_stripe_service_success(uuid) to service_role;

create or replace function public.service_booking_payment_summary(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;q public.quotes;paid numeric;pending numeric;fee_paid numeric;
begin
  select * into b from public.bookings where id=p_booking_id;
  if b.id is null then raise exception 'Booking not found';end if;
  if not (b.customer_id=auth.uid() or public.is_business_member(b.business_id) or public.is_admin()) then raise exception 'Not authorized';end if;

  select * into q from public.quotes where id=b.quote_id;
  select coalesce(sum(amount) filter(where status='SUCCEEDED'),0),coalesce(sum(amount) filter(where status='PENDING'),0),coalesce(sum(marketplace_fee) filter(where status='SUCCEEDED'),0)
  into paid,pending,fee_paid from public.service_payments where booking_id=b.id;

  return jsonb_build_object(
    'booking_id',b.id,'total',round(coalesce(q.total,b.price),2),'paid',round(paid,2),'pending',round(pending,2),
    'balance_due',round(greatest(coalesce(q.total,b.price)-paid,0),2),
    'marketplace_fee_total',public.calculate_service_platform_fee(coalesce(q.total,b.price)),
    'marketplace_fee_collected',round(fee_paid,2),'fully_paid',paid>=coalesce(q.total,b.price)
  );
end $$;

grant execute on function public.service_booking_payment_summary(uuid) to authenticated;

create or replace function public.update_booking_status(p_booking_id uuid,p_next public.booking_status)
returns boolean language plpgsql security definer set search_path='public' as $$
declare b public.bookings;allowed boolean:=false;caller_business boolean:=false;verified boolean:=false;paid numeric:=0;balance_due numeric:=0;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null then raise exception 'Booking not found';end if;
  caller_business:=public.is_business_member(b.business_id);
  select verification_status='VERIFIED' into verified from public.businesses where id=b.business_id;

  if not (b.customer_id=auth.uid() or caller_business or public.is_admin()) then raise exception 'Not authorized';end if;
  if caller_business and not coalesce(verified,false) and not public.is_admin() then raise exception 'Verified business access is required';end if;

  if public.is_admin() then allowed:=true;
  elsif caller_business then allowed:=(b.status,p_next) in (
    ('REQUESTED','PENDING_PAYMENT'),('REQUESTED','CONFIRMED'),('PENDING_PAYMENT','CONFIRMED'),('CONFIRMED','UPCOMING'),('UPCOMING','IN_PROGRESS'),('IN_PROGRESS','COMPLETED'),
    ('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED')
  );
  else allowed:=(b.status,p_next) in (
    ('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED')
  );end if;
  if not allowed then raise exception 'Invalid booking transition';end if;

  if b.marketplace_payment_required then
    select coalesce(sum(sp.amount),0) into paid from public.service_payments sp where sp.booking_id=b.id and sp.status='SUCCEEDED';
    balance_due:=round(greatest(b.price-paid,0),2);

    if p_next='COMPLETED' and balance_due>0 then raise exception 'Outstanding Everest balance must be paid before this job can be completed';end if;

    if p_next='IN_PROGRESS' and balance_due>0 then
      insert into public.notifications(user_id,kind,title,body,data)
      values(b.customer_id,'SERVICE_BALANCE_DUE','Service balance due','Your service is in progress. Pay the remaining Everest balance securely in your booking.',jsonb_build_object('booking_id',b.id,'balance_due',balance_due,'route','/booking'));
    end if;
  end if;

  update public.bookings set status=p_next,completed_at=case when p_next='COMPLETED' then now() else completed_at end,updated_at=now() where id=p_booking_id;
  return true;
end $$;

create or replace function public.flag_marketplace_payment_circumvention()
returns trigger language plpgsql security definer set search_path='' as $$
declare conv public.conversations;normalized text;reason_value text;
begin
  select * into conv from public.conversations where id=new.conversation_id;
  if conv.id is null then return new;end if;
  if conv.request_id is null and conv.booking_id is null then return new;end if;

  if not exists(select 1 from public.business_members bm where bm.business_id=conv.business_id and bm.user_id=new.sender_id)
  then return new;end if;

  normalized:=lower(new.body);
  if normalized ~ '(payid|pay id|osko|bank transfer|direct transfer|paypal|revolut|wise transfer|cash payment|pay cash|outside everest|off platform|avoid (the )?fee|save (the )?fee|no platform fee|bsb[ :]|account number)'
  then reason_value:='LIKELY_OFF_PLATFORM_PAYMENT_SOLICITATION';
  else return new;end if;

  insert into public.payment_circumvention_flags(conversation_id,message_id,business_id,sender_id,reason)
  values(conv.id,new.id,conv.business_id,new.sender_id,reason_value)
  on conflict(message_id) do nothing;

  if not exists(select 1 from public.notifications n where n.user_id=new.sender_id and n.kind='PAYMENT_SAFETY_REMINDER' and n.created_at>now()-interval '24 hours') then
    insert into public.notifications(user_id,kind,title,body,data)
    values(new.sender_id,'PAYMENT_SAFETY_REMINDER','Keep Everest jobs paid in Everest','Marketplace service payments must stay in Everest so the booking, payment record and protections remain valid.',jsonb_build_object('conversation_id',conv.id,'booking_id',conv.booking_id,'request_id',conv.request_id));
  end if;
  return new;
end $$;

drop trigger if exists trg_flag_marketplace_payment_circumvention on public.messages;
create trigger trg_flag_marketplace_payment_circumvention after insert on public.messages
for each row execute function public.flag_marketplace_payment_circumvention();

revoke all on function public.flag_marketplace_payment_circumvention() from public,anon,authenticated;
