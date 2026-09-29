-- Prevent a customer from cancelling/releasing a product order after a Stripe
-- Checkout Session exists. Trusted webhook failure/expiry processing remains
-- authoritative once external payment is in flight.

create or replace function public.release_my_order_reservations(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  o public.orders;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into o
  from public.orders
  where id=p_order_id and customer_id=auth.uid()
  for update;

  if o.id is null then return false; end if;
  if o.status<>'PENDING' or o.payment_status<>'PENDING' then return false; end if;

  if exists(
    select 1
    from public.payments p
    where p.order_id=o.id
      and p.status='PENDING'
      and nullif(p.provider_checkout_session_id,'') is not null
  ) then
    raise exception 'Checkout is already in progress. Stripe must confirm failure or expiry before this order can be released';
  end if;

  update public.inventory i
  set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),
      updated_at=now()
  from public.order_items oi
  where oi.order_id=o.id and oi.product_id=i.product_id;

  update public.orders
  set status='CANCELLED',payment_status='FAILED',updated_at=now()
  where id=o.id and status='PENDING' and payment_status='PENDING';

  update public.payments
  set status='FAILED',updated_at=now()
  where order_id=o.id and status='PENDING';

  update public.carts
  set active_checkout_order_id=null,updated_at=now()
  where customer_id=o.customer_id and active_checkout_order_id=o.id;

  return true;
end
$$;

revoke all on function public.release_my_order_reservations(uuid) from public,anon;
grant execute on function public.release_my_order_reservations(uuid) to authenticated;
