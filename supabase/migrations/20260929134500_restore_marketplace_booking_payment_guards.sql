-- Restore marketplace payment invariants after the assignment-aware business-ops rewrite.
-- Keep the newer can_operate_business_booking authorization while making Stripe
-- authoritative for payment confirmation and preventing unreconciled paid cancellations.

create or replace function public.update_booking_status(
  p_booking_id uuid,
  p_next public.booking_status
)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  b public.bookings;
  allowed boolean:=false;
  caller_business boolean:=false;
  paid numeric:=0;
  balance_due numeric:=0;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null then raise exception 'Booking not found'; end if;

  caller_business:=public.can_operate_business_booking(b.id);
  if not (b.customer_id=auth.uid() or caller_business or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if public.is_admin() then
    allowed:=true;
  elsif caller_business then
    allowed:=(b.status,p_next) in (
      ('REQUESTED','PENDING_PAYMENT'),('REQUESTED','CONFIRMED'),('PENDING_PAYMENT','CONFIRMED'),
      ('CONFIRMED','UPCOMING'),('UPCOMING','IN_PROGRESS'),('IN_PROGRESS','COMPLETED'),
      ('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),
      ('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED')
    );
  else
    allowed:=(b.status,p_next) in (
      ('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),
      ('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED')
    );
  end if;

  if not allowed then raise exception 'Invalid booking transition'; end if;

  if b.marketplace_payment_required then
    select coalesce(sum(sp.amount),0)
    into paid
    from public.service_payments sp
    where sp.booking_id=b.id and sp.status='SUCCEEDED';

    balance_due:=round(greatest(b.price-paid,0),2);

    if not public.is_admin()
       and b.status='PENDING_PAYMENT'
       and p_next='CONFIRMED'
       and paid<=0 then
      raise exception 'Marketplace payment must be confirmed by Stripe before this booking can be confirmed';
    end if;

    if p_next='COMPLETED' and balance_due>0 then
      raise exception 'Outstanding Everest balance must be paid before this job can be completed';
    end if;

    if not public.is_admin() and p_next='CANCELLED' and paid>0 then
      raise exception 'Paid Everest bookings require support cancellation so the payment can be reconciled';
    end if;

    if p_next='IN_PROGRESS' and balance_due>0 then
      insert into public.notifications(user_id,kind,title,body,data)
      values(
        b.customer_id,
        'SERVICE_BALANCE_DUE',
        'Service balance due',
        'Your service is in progress. Pay the remaining Everest balance securely in your booking.',
        jsonb_build_object('booking_id',b.id,'balance_due',balance_due,'route','/booking')
      );
    end if;
  end if;

  update public.bookings
  set status=p_next,
      completed_at=case when p_next='COMPLETED' then now() else completed_at end,
      updated_at=now()
  where id=p_booking_id;

  return true;
end
$$;

revoke all on function public.update_booking_status(uuid,public.booking_status) from public,anon;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;
