-- Prevent multiple independent pending orders from the same customer cart.
-- The cart is the serialized checkout boundary; successful/failed checkout clears the claim.
alter table public.carts add column if not exists active_checkout_order_id uuid references public.orders(id) on delete set null;
create unique index if not exists carts_active_checkout_unique on public.carts(active_checkout_order_id) where active_checkout_order_id is not null;

create or replace function public.create_order_from_cart(
  p_idempotency_key text,
  p_delivery_method text default 'PICKUP',
  p_delivery_address jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid(); cid uuid; active_oid uuid; active_status public.order_status; active_payment public.payment_status;
  item record; bid uuid; subtotal numeric:=0; total numeric; oid uuid; onum text; existing_status public.order_status; existing_payment public.payment_status;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,''))<12 or length(p_idempotency_key)>128 then raise exception 'Invalid idempotency key'; end if;

  select p.order_id,o.status,o.payment_status into oid,existing_status,existing_payment
  from public.payments p join public.orders o on o.id=p.order_id
  where p.idempotency_key=p_idempotency_key and p.customer_id=uid limit 1;
  if oid is not null then
    if existing_status='PENDING' and existing_payment='PENDING' then
      select order_number into onum from public.orders where id=oid;
      return jsonb_build_object('order_id',oid,'order_number',onum,'reused',true);
    end if;
    raise exception 'Checkout attempt is no longer pending; start a new checkout attempt';
  end if;

  select id,active_checkout_order_id into cid,active_oid from public.carts where customer_id=uid for update;
  if cid is null then raise exception 'Cart is empty'; end if;
  if active_oid is not null then
    select status,payment_status into active_status,active_payment from public.orders where id=active_oid;
    if active_status='PENDING' and active_payment='PENDING' then
      select order_number into onum from public.orders where id=active_oid;
      return jsonb_build_object('order_id',active_oid,'order_number',onum,'reused',true);
    end if;
    update public.carts set active_checkout_order_id=null where id=cid;
  end if;

  create temporary table if not exists _checkout_items(product_id uuid,quantity integer,unit_price numeric,name text,business_id uuid) on commit drop;
  delete from _checkout_items;
  for item in
    select ci.product_id,ci.quantity,p.name,p.price,p.sale_price,p.status,p.business_id
    from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cid
  loop
    if item.status<>'ACTIVE' then raise exception 'A product is no longer available'; end if;
    if bid is null then bid:=item.business_id; elsif bid<>item.business_id then raise exception 'Checkout currently supports one business per order'; end if;
    perform 1 from public.inventory i where i.product_id=item.product_id and i.stock_quantity-i.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient stock'; end if;
    item.unit_price:=coalesce(item.sale_price,item.price); subtotal:=subtotal+(item.unit_price*item.quantity);
    insert into _checkout_items values(item.product_id,item.quantity,item.unit_price,item.name,item.business_id);
  end loop;
  if not exists(select 1 from _checkout_items) then raise exception 'Cart is empty'; end if;

  total:=round(subtotal,2); onum:='EL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
  insert into public.orders(order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,delivery_address)
  values(onum,uid,bid,'PENDING','PENDING',subtotal,0,0,0,total,p_delivery_method,p_delivery_address) returning id into oid;
  update public.carts set active_checkout_order_id=oid where id=cid;
  for item in select * from _checkout_items loop
    update public.inventory set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where product_id=item.product_id;
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total) values(oid,item.product_id,item.name,item.unit_price,item.quantity,item.unit_price*item.quantity);
  end loop;
  insert into public.payments(customer_id,order_id,amount,currency,status,idempotency_key) values(uid,oid,total,'aud','PENDING',p_idempotency_key);
  return jsonb_build_object('order_id',oid,'order_number',onum,'total',total,'reused',false);
end;
$$;
grant execute on function public.create_order_from_cart(text,text,jsonb) to authenticated;

create or replace function public.process_stripe_order_success(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o public.orders; item record; payment_id uuid;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if o.payment_status='SUCCEEDED' then return true; end if;
 if o.payment_status<>'PENDING' or o.status<>'PENDING' then raise exception 'Order is not payable'; end if;
 select id into payment_id from public.payments where order_id=o.id and status='PENDING' order by created_at desc limit 1 for update;
 if payment_id is null then raise exception 'Pending payment record not found'; end if;
 for item in select oi.product_id,oi.quantity from public.order_items oi where oi.order_id=o.id loop
   update public.inventory set stock_quantity=stock_quantity-item.quantity,reserved_quantity=reserved_quantity-item.quantity,updated_at=now()
   where product_id=item.product_id and stock_quantity>=item.quantity and reserved_quantity>=item.quantity;
   if not found then raise exception 'Inventory finalization failed'; end if;
   update public.products set status='OUT_OF_STOCK',updated_at=now() where id=item.product_id and not exists(select 1 from public.inventory where product_id=item.product_id and stock_quantity-reserved_quantity>0);
 end loop;
 update public.orders set payment_status='SUCCEEDED',status='PAYMENT_CONFIRMED',updated_at=now() where id=o.id;
 update public.payments set status='SUCCEEDED',updated_at=now() where id=payment_id;
 update public.carts set active_checkout_order_id=null where customer_id=o.customer_id and active_checkout_order_id=o.id;
 delete from public.cart_items ci where ci.cart_id in(select c.id from public.carts c where c.customer_id=o.customer_id and c.active_checkout_order_id is null) and exists(select 1 from public.order_items oi where oi.order_id=o.id and oi.product_id=ci.product_id);
 return true;
end;
$$;
revoke execute on function public.process_stripe_order_success(uuid) from anon,authenticated;
grant execute on function public.process_stripe_order_success(uuid) to service_role;

create or replace function public.process_stripe_order_failure(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if o.payment_status='SUCCEEDED' then return true; end if;
 if o.payment_status='FAILED' and o.status='CANCELLED' then return true; end if;
 if o.payment_status<>'PENDING' then return true; end if;
 update public.inventory i set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),updated_at=now() from public.order_items oi where oi.order_id=o.id and oi.product_id=i.product_id;
 update public.orders set status='CANCELLED',payment_status='FAILED',updated_at=now() where id=o.id and payment_status='PENDING';
 update public.payments set status='FAILED',updated_at=now() where order_id=o.id and status='PENDING';
 update public.carts set active_checkout_order_id=null where customer_id=o.customer_id and active_checkout_order_id=o.id;
 return true;
end;
$$;
revoke execute on function public.process_stripe_order_failure(uuid) from anon,authenticated;
grant execute on function public.process_stripe_order_failure(uuid) to service_role;
