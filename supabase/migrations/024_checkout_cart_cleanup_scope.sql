-- Keep successful checkout cleanup scoped to the exact cart that created the order.
-- Do not delete newly-added items from another checkout/cart state for the same customer.
create or replace function public.process_stripe_order_success(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  o public.orders;
  item record;
  payment_id uuid;
  source_cart_id uuid;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.payment_status='SUCCEEDED' then return true; end if;
  if o.payment_status<>'PENDING' or o.status<>'PENDING' then raise exception 'Order is not payable'; end if;

  select id into payment_id
  from public.payments
  where order_id=o.id and status='PENDING'
  order by created_at desc
  limit 1
  for update;
  if payment_id is null then raise exception 'Pending payment record not found'; end if;

  select id into source_cart_id
  from public.carts
  where customer_id=o.customer_id and active_checkout_order_id=o.id
  for update;

  for item in select oi.product_id,oi.quantity from public.order_items oi where oi.order_id=o.id loop
    update public.inventory
    set stock_quantity=stock_quantity-item.quantity,
        reserved_quantity=reserved_quantity-item.quantity,
        updated_at=now()
    where product_id=item.product_id
      and stock_quantity>=item.quantity
      and reserved_quantity>=item.quantity;
    if not found then raise exception 'Inventory finalization failed'; end if;
    update public.products
    set status='OUT_OF_STOCK',updated_at=now()
    where id=item.product_id
      and not exists(select 1 from public.inventory where product_id=item.product_id and stock_quantity-reserved_quantity>0);
  end loop;

  update public.orders
  set payment_status='SUCCEEDED',status='PAYMENT_CONFIRMED',updated_at=now()
  where id=o.id;
  update public.payments
  set status='SUCCEEDED',updated_at=now()
  where id=payment_id;

  if source_cart_id is not null then
    update public.carts
    set active_checkout_order_id=null,updated_at=now()
    where id=source_cart_id;
    delete from public.cart_items ci
    where ci.cart_id=source_cart_id
      and exists(
        select 1
        from public.order_items oi
        where oi.order_id=o.id and oi.product_id=ci.product_id
      );
  end if;

  return true;
end;
$$;

revoke execute on function public.process_stripe_order_success(uuid) from anon,authenticated;
grant execute on function public.process_stripe_order_success(uuid) to service_role;
