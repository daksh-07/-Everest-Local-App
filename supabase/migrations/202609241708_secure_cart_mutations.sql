create or replace function public.set_my_cart_item(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  active_oid uuid;
  product_business uuid;
  other_business uuid;
  available_stock integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_product_id is null or p_quantity is null or p_quantity < 0 or p_quantity > 99 then raise exception 'Invalid cart quantity'; end if;

  select id, active_checkout_order_id into cid, active_oid
  from public.carts where customer_id=uid for update;
  if cid is null then
    insert into public.carts(customer_id) values(uid)
    on conflict(customer_id) do update set updated_at=now()
    returning id,active_checkout_order_id into cid,active_oid;
  end if;

  if active_oid is not null and exists(select 1 from public.orders where id=active_oid and customer_id=uid and status='PENDING' and payment_status='PENDING') then
    update public.inventory i set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),updated_at=now()
      from public.order_items oi where oi.order_id=active_oid and oi.product_id=i.product_id;
    update public.orders set status='CANCELLED',payment_status='FAILED',updated_at=now() where id=active_oid and customer_id=uid and status='PENDING' and payment_status='PENDING';
    update public.payments set status='FAILED',updated_at=now() where order_id=active_oid and customer_id=uid and status='PENDING';
    update public.carts set active_checkout_order_id=null,updated_at=now() where id=cid;
  elsif active_oid is not null then
    update public.carts set active_checkout_order_id=null,updated_at=now() where id=cid;
  end if;

  if p_quantity=0 then
    delete from public.cart_items where cart_id=cid and product_id=p_product_id;
    return;
  end if;

  select p.business_id, i.stock_quantity-i.reserved_quantity into product_business,available_stock
  from public.products p
  join public.businesses b on b.id=p.business_id
  join public.inventory i on i.product_id=p.id
  where p.id=p_product_id and p.status='ACTIVE' and b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_orders
  for update of i;
  if product_business is null then raise exception 'Product unavailable'; end if;
  if available_stock < p_quantity then raise exception 'Insufficient stock'; end if;

  select p.business_id into other_business
  from public.cart_items ci join public.products p on p.id=ci.product_id
  where ci.cart_id=cid and ci.product_id<>p_product_id limit 1;
  if other_business is not null and other_business<>product_business then raise exception 'Cart can contain products from one business at a time'; end if;

  insert into public.cart_items(cart_id,product_id,quantity) values(cid,p_product_id,p_quantity)
  on conflict(cart_id,product_id) do update set quantity=excluded.quantity;
  update public.carts set updated_at=now() where id=cid;
end;
$$;

revoke all on function public.set_my_cart_item(uuid,integer) from public,anon;
grant execute on function public.set_my_cart_item(uuid,integer) to authenticated;
revoke insert,update,delete on public.cart_items from authenticated;
grant select on public.cart_items to authenticated;
