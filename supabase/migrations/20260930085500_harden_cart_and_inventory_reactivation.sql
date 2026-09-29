-- Final launch hardening for product checkout and stock reactivation.
-- Cart mutation cannot invalidate an order once Stripe Checkout is in flight.
-- Stock updates cannot bypass the authoritative product publication gate.

create or replace function public.set_my_cart_item_v2(
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  uid uuid:=auth.uid();
  cid uuid;
  active_oid uuid;
  product_business uuid;
  other_business uuid;
  available_stock integer;
  has_variants boolean;
  track boolean;
  made boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_product_id is null or p_quantity is null or p_quantity<0 or p_quantity>99 then
    raise exception 'Invalid cart quantity';
  end if;

  select id,active_checkout_order_id
  into cid,active_oid
  from public.carts
  where customer_id=uid
  for update;

  if cid is null then
    insert into public.carts(customer_id)
    values(uid)
    on conflict(customer_id) do update set updated_at=now()
    returning id,active_checkout_order_id into cid,active_oid;
  end if;

  if active_oid is not null
     and exists(
       select 1
       from public.orders
       where id=active_oid
         and customer_id=uid
         and status='PENDING'
         and payment_status='PENDING'
     ) then

    if exists(
      select 1
      from public.payments p
      where p.order_id=active_oid
        and p.customer_id=uid
        and p.status='PENDING'
        and nullif(p.provider_checkout_session_id,'') is not null
    ) then
      raise exception 'Checkout is already in progress. Finish or let the Stripe checkout expire before changing this cart';
    end if;

    update public.product_variants v
    set reserved_quantity=greatest(0,v.reserved_quantity-oi.quantity),updated_at=now()
    from public.order_items oi
    where oi.order_id=active_oid and oi.variant_id=v.id;

    update public.inventory i
    set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),updated_at=now()
    from public.order_items oi
    where oi.order_id=active_oid
      and oi.variant_id is null
      and oi.product_id=i.product_id;

    update public.orders
    set status='CANCELLED',payment_status='FAILED',updated_at=now()
    where id=active_oid
      and customer_id=uid
      and status='PENDING'
      and payment_status='PENDING';

    update public.payments
    set status='FAILED',updated_at=now()
    where order_id=active_oid and customer_id=uid and status='PENDING';

    update public.carts
    set active_checkout_order_id=null,updated_at=now()
    where id=cid;
  elsif active_oid is not null then
    update public.carts
    set active_checkout_order_id=null,updated_at=now()
    where id=cid;
  end if;

  if p_quantity=0 then
    delete from public.cart_items
    where cart_id=cid
      and product_id=p_product_id
      and variant_id is not distinct from p_variant_id;
    return;
  end if;

  select p.business_id,p.track_stock,p.made_to_order
  into product_business,track,made
  from public.products p
  join public.businesses b on b.id=p.business_id
  where p.id=p_product_id
    and p.status='ACTIVE'
    and b.status='ACTIVE'
    and b.verification_status='VERIFIED'
    and b.accepts_orders
    and public.is_business_payment_ready(p.business_id);

  if product_business is null then raise exception 'Product unavailable'; end if;

  select exists(select 1 from public.product_variants where product_id=p_product_id)
  into has_variants;

  if has_variants and p_variant_id is null then raise exception 'Select a product option'; end if;

  if p_variant_id is not null then
    select stock_quantity-reserved_quantity
    into available_stock
    from public.product_variants
    where id=p_variant_id and product_id=p_product_id and available
    for update;
    if available_stock is null then raise exception 'Variant unavailable'; end if;
  else
    select i.stock_quantity-i.reserved_quantity
    into available_stock
    from public.inventory i
    where i.product_id=p_product_id
    for update;
  end if;

  if track and not made and coalesce(available_stock,0)<p_quantity then
    raise exception 'Insufficient stock';
  end if;

  select p.business_id
  into other_business
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  where ci.cart_id=cid
    and (ci.product_id<>p_product_id or ci.variant_id is distinct from p_variant_id)
  limit 1;

  if other_business is not null and other_business<>product_business then
    raise exception 'Cart can contain products from one business at a time';
  end if;

  insert into public.cart_items(cart_id,product_id,variant_id,quantity)
  values(cid,p_product_id,p_variant_id,p_quantity)
  on conflict(cart_id,product_id,(coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)))
  do update set quantity=excluded.quantity;

  update public.carts set updated_at=now() where id=cid;
end
$$;

revoke all on function public.set_my_cart_item_v2(uuid,uuid,integer) from public,anon;
grant execute on function public.set_my_cart_item_v2(uuid,uuid,integer) to authenticated;


create or replace function public.set_product_inventory(
  p_product_id uuid,
  p_quantity integer,
  p_low_stock_threshold integer default 5
)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  bid uuid;
  reserved integer;
  current_status public.product_status;
  track boolean;
  made boolean;
  available_after integer;
begin
  select p.business_id,i.reserved_quantity,p.status,p.track_stock,p.made_to_order
  into bid,reserved,current_status,track,made
  from public.products p
  join public.inventory i on i.product_id=p.id
  where p.id=p_product_id
  for update of i,p;

  if bid is null or auth.uid() is null
     or not (public.has_business_permission(bid,'CATALOG_MANAGE') or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if p_quantity is null or p_quantity<coalesce(reserved,0) then
    raise exception 'Stock cannot be below reserved quantity';
  end if;
  if p_low_stock_threshold is null or p_low_stock_threshold<0 then
    raise exception 'Invalid low stock threshold';
  end if;

  update public.inventory
  set stock_quantity=p_quantity,
      low_stock_threshold=p_low_stock_threshold,
      updated_at=now()
  where product_id=p_product_id;

  available_after:=p_quantity-coalesce(reserved,0);

  if current_status='ACTIVE' and track and not made and available_after<=0 then
    update public.products
    set status='OUT_OF_STOCK',updated_at=now()
    where id=p_product_id;
  elsif current_status='OUT_OF_STOCK'
        and (not track or made or available_after>0) then
    begin
      perform public.set_product_status(p_product_id,'ACTIVE');
    exception when others then
      -- Stock is still saved, but publishing remains blocked until every
      -- authoritative verification/payment/listing requirement passes.
      null;
    end;
  else
    update public.products set updated_at=now() where id=p_product_id;
  end if;

  return true;
end
$$;

revoke all on function public.set_product_inventory(uuid,integer,integer) from public,anon;
grant execute on function public.set_product_inventory(uuid,integer,integer) to authenticated;


create or replace function public.adjust_inventory(p_product_id uuid,p_delta integer)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  bid uuid;
  current_stock integer;
  reserved integer;
  current_status public.product_status;
  track boolean;
  made boolean;
  next_stock integer;
begin
  select p.business_id,p.status,p.track_stock,p.made_to_order
  into bid,current_status,track,made
  from public.products p
  where p.id=p_product_id
  for update;

  if bid is null then raise exception 'Product not found'; end if;
  if not (public.has_business_permission(bid,'CATALOG_MANAGE') or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  if p_delta=0 then return true; end if;

  select stock_quantity,reserved_quantity
  into current_stock,reserved
  from public.inventory
  where product_id=p_product_id
  for update;

  if current_stock is null then
    insert into public.inventory(product_id,stock_quantity)
    values(p_product_id,greatest(0,p_delta));
    next_stock:=greatest(0,p_delta);
    reserved:=0;
  else
    next_stock:=current_stock+p_delta;
    if next_stock<reserved then raise exception 'Stock cannot fall below reserved quantity'; end if;
    if next_stock<0 then raise exception 'Inventory cannot become negative'; end if;
    update public.inventory
    set stock_quantity=next_stock,updated_at=now()
    where product_id=p_product_id;
  end if;

  if current_status='ACTIVE' and track and not made and next_stock-coalesce(reserved,0)<=0 then
    update public.products
    set status='OUT_OF_STOCK',updated_at=now()
    where id=p_product_id;
  elsif current_status='OUT_OF_STOCK'
        and (not track or made or next_stock-coalesce(reserved,0)>0) then
    begin
      perform public.set_product_status(p_product_id,'ACTIVE');
    exception when others then
      null;
    end;
  else
    update public.products set updated_at=now() where id=p_product_id;
  end if;

  return true;
end
$$;

revoke all on function public.adjust_inventory(uuid,integer) from public,anon;
grant execute on function public.adjust_inventory(uuid,integer) to authenticated;
