-- Persist the Stripe Checkout Session identity so retries of the same checkout attempt
-- resolve to the same provider session instead of creating ambiguous payment attempts.
alter table public.payments add column if not exists provider_checkout_session_id text unique;

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
  uid uuid:=auth.uid();
  cid uuid;
  item record;
  bid uuid;
  subtotal numeric:=0;
  total numeric;
  oid uuid;
  onum text;
  existing_status public.order_status;
  existing_payment public.payment_status;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,''))<12 or length(p_idempotency_key)>128 then raise exception 'Invalid idempotency key'; end if;

  select p.order_id,o.status,o.payment_status into oid,existing_status,existing_payment
  from public.payments p
  join public.orders o on o.id=p.order_id
  where p.idempotency_key=p_idempotency_key and p.customer_id=uid
  limit 1;
  if oid is not null then
    if existing_status='PENDING' and existing_payment='PENDING' then
      select order_number into onum from public.orders where id=oid;
      return jsonb_build_object('order_id',oid,'order_number',onum,'reused',true);
    end if;
    raise exception 'Checkout attempt is no longer pending; start a new checkout attempt';
  end if;

  select id into cid from public.carts where customer_id=uid for update;
  if cid is null then raise exception 'Cart is empty'; end if;

  create temporary table if not exists _checkout_items(product_id uuid,quantity integer,unit_price numeric,name text,business_id uuid) on commit drop;
  delete from _checkout_items;
  for item in
    select ci.product_id,ci.quantity,p.name,p.price,p.sale_price,p.status,p.business_id
    from public.cart_items ci
    join public.products p on p.id=ci.product_id
    where ci.cart_id=cid
  loop
    if item.status<>'ACTIVE' then raise exception 'A product is no longer available'; end if;
    if bid is null then bid:=item.business_id; elsif bid<>item.business_id then raise exception 'Checkout currently supports one business per order'; end if;
    perform 1 from public.inventory i where i.product_id=item.product_id and i.stock_quantity-i.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient stock'; end if;
    item.unit_price:=coalesce(item.sale_price,item.price);
    subtotal:=subtotal+(item.unit_price*item.quantity);
    insert into _checkout_items values(item.product_id,item.quantity,item.unit_price,item.name,item.business_id);
  end loop;
  if not exists(select 1 from _checkout_items) then raise exception 'Cart is empty'; end if;

  total:=round(subtotal,2);
  onum:='EL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
  insert into public.orders(order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,delivery_address)
  values(onum,uid,bid,'PENDING','PENDING',subtotal,0,0,0,total,p_delivery_method,p_delivery_address)
  returning id into oid;

  for item in select * from _checkout_items loop
    update public.inventory set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where product_id=item.product_id;
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total)
    values(oid,item.product_id,item.name,item.unit_price,item.quantity,item.unit_price*item.quantity);
  end loop;

  insert into public.payments(customer_id,order_id,amount,currency,status,idempotency_key)
  values(uid,oid,total,'aud','PENDING',p_idempotency_key);
  return jsonb_build_object('order_id',oid,'order_number',onum,'total',total,'reused',false);
end;
$$;

grant execute on function public.create_order_from_cart(text,text,jsonb) to authenticated;
