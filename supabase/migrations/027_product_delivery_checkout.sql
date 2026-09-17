-- Make the product checkout delivery choice authoritative instead of hard-coded to pickup.
-- Delivery eligibility is validated from trusted product rows inside the locked checkout transaction.

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
  if p_delivery_method not in ('PICKUP','EVEREST_DELIVERY','SAME_DAY') then raise exception 'Invalid delivery method'; end if;
  if p_delivery_method<>'PICKUP' and (p_delivery_address is null or jsonb_typeof(p_delivery_address)<>'object' or length(trim(coalesce(p_delivery_address->>'address_line','')))<5) then raise exception 'A valid delivery address is required'; end if;

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

  create temporary table if not exists _checkout_items(cart_item_id uuid,product_id uuid,quantity integer,unit_price numeric,name text,business_id uuid) on commit drop;
  delete from _checkout_items;
  for item in
    select ci.id as cart_item_id,ci.product_id,ci.quantity,p.name,p.price,p.sale_price,p.status,p.business_id,p.delivery_eligible,p.pickup_available
    from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cid
  loop
    if item.status<>'ACTIVE' then raise exception 'A product is no longer available'; end if;
    if p_delivery_method='PICKUP' and not item.pickup_available then raise exception 'A product in the cart is not available for pickup'; end if;
    if p_delivery_method in ('EVEREST_DELIVERY','SAME_DAY') and not item.delivery_eligible then raise exception 'A product in the cart is not eligible for delivery'; end if;
    if bid is null then bid:=item.business_id; elsif bid<>item.business_id then raise exception 'Checkout currently supports one business per order'; end if;
    perform 1 from public.inventory i where i.product_id=item.product_id and i.stock_quantity-i.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient stock'; end if;
    item.unit_price:=coalesce(item.sale_price,item.price); subtotal:=subtotal+(item.unit_price*item.quantity);
    insert into _checkout_items values(item.cart_item_id,item.product_id,item.quantity,item.unit_price,item.name,item.business_id);
  end loop;
  if not exists(select 1 from _checkout_items) then raise exception 'Cart is empty'; end if;

  total:=round(subtotal,2); onum:='EL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
  insert into public.orders(order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,delivery_address)
  values(onum,uid,bid,'PENDING','PENDING',subtotal,0,0,0,total,p_delivery_method,p_delivery_address) returning id into oid;
  update public.carts set active_checkout_order_id=oid,updated_at=now() where id=cid;
  for item in select * from _checkout_items loop
    update public.inventory set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where product_id=item.product_id;
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total,source_cart_item_id)
    values(oid,item.product_id,item.name,item.unit_price,item.quantity,item.unit_price*item.quantity,item.cart_item_id);
  end loop;
  insert into public.payments(customer_id,order_id,amount,currency,status,idempotency_key) values(uid,oid,total,'aud','PENDING',p_idempotency_key);
  return jsonb_build_object('order_id',oid,'order_number',onum,'total',total,'reused',false);
end;
$$;

grant execute on function public.create_order_from_cart(text,text,jsonb) to authenticated;
