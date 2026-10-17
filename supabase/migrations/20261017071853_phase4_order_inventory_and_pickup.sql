-- Review-only Phase 4 migration. Never apply to production without approval.
-- ROLLOUT PRECONDITION: pause product checkout traffic and reconcile/expire
-- every pending product checkout first. Keep traffic paused through Edge rollout.
-- Historic rows did not snapshot reservation mode; guessing it from today's
-- mutable product flags could corrupt inventory. Abort rather than backfill.
begin;
lock table public.orders,public.order_items,public.carts in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.orders where status='PENDING' and payment_status='PENDING') then
  raise exception 'Reconcile pending product checkouts before applying Phase 4 inventory migration';
 end if;
end $$;
alter table public.orders add column checkout_started_at timestamptz;
alter table public.order_items add column inventory_reservation text not null default 'NONE'
 check (inventory_reservation in ('NONE','PRODUCT','VARIANT'));
comment on column public.order_items.inventory_reservation is 'Server-owned inventory ledger mode captured at reservation time. Historical settled rows are NONE.';

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
 uid uuid:=auth.uid();cid uuid;active_oid uuid;active_status public.order_status;active_payment public.payment_status;
 item record;bid uuid;subtotal numeric:=0;delivery_total numeric:=0;total numeric;oid uuid;onum text;existing_status public.order_status;existing_payment public.payment_status;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if length(coalesce(p_idempotency_key,''))<12 or length(p_idempotency_key)>128 then raise exception 'Invalid idempotency key'; end if;
 if p_delivery_method not in ('PICKUP','EVEREST_DELIVERY','SAME_DAY','SHIPPING') then raise exception 'Invalid delivery method'; end if;
 if p_delivery_method<>'PICKUP' and (p_delivery_address is null or jsonb_typeof(p_delivery_address)<>'object' or length(trim(coalesce(p_delivery_address->>'address_line','')))<5) then raise exception 'A valid delivery address is required'; end if;

 select p.order_id,o.status,o.payment_status into oid,existing_status,existing_payment from public.payments p join public.orders o on o.id=p.order_id where p.idempotency_key=p_idempotency_key and p.customer_id=uid limit 1;
 if oid is not null then
  if existing_status='PENDING' and existing_payment='PENDING' then select order_number into onum from public.orders where id=oid;return jsonb_build_object('order_id',oid,'order_number',onum,'reused',true);end if;
  raise exception 'Checkout attempt is no longer pending; start a new checkout attempt';
 end if;

 select id,active_checkout_order_id into cid,active_oid from public.carts where customer_id=uid for update;
 if cid is null then raise exception 'Cart is empty'; end if;
 if active_oid is not null then
  select status,payment_status into active_status,active_payment from public.orders where id=active_oid;
  if active_status='PENDING' and active_payment='PENDING' then select order_number into onum from public.orders where id=active_oid;return jsonb_build_object('order_id',active_oid,'order_number',onum,'reused',true);end if;
  update public.carts set active_checkout_order_id=null where id=cid;
 end if;

 create temporary table if not exists _checkout_items(
   cart_item_id uuid,product_id uuid,variant_id uuid,quantity integer,unit_price numeric,name text,business_id uuid,variant_snapshot jsonb,track_stock boolean,made_to_order boolean
 ) on commit drop;
 delete from _checkout_items;

 for item in
  select ci.id cart_item_id,ci.product_id,ci.variant_id,ci.quantity,p.name,p.price,p.sale_price,p.status,p.business_id,
   p.delivery_eligible,p.pickup_available,p.shipping_available,p.shipping_fee,p.track_stock,p.made_to_order,
   b.status business_status,b.verification_status,b.accepts_orders,
   v.id v_id,v.title v_title,v.option_values v_options,v.price v_price,v.stock_quantity v_stock,v.reserved_quantity v_reserved,v.available v_available,null::numeric as unit_price
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  join public.businesses b on b.id=p.business_id
  left join public.product_variants v on v.id=ci.variant_id and v.product_id=p.id
  where ci.cart_id=cid
  order by ci.product_id,ci.variant_id,ci.id
 loop
  if item.quantity is null or item.quantity<1 or item.quantity>99 then raise exception 'Invalid cart quantity';end if;
  if item.status<>'ACTIVE' or item.business_status<>'ACTIVE' or item.verification_status<>'VERIFIED' or not item.accepts_orders then raise exception 'A product is no longer available for purchase'; end if;
  if p_delivery_method='PICKUP' and not item.pickup_available then raise exception 'A product in the cart is not available for pickup'; end if;
  if p_delivery_method in ('EVEREST_DELIVERY','SAME_DAY') and not item.delivery_eligible then raise exception 'A product in the cart is not eligible for local delivery'; end if;
  if p_delivery_method='SHIPPING' and not item.shipping_available then raise exception 'A product in the cart is not available for shipping'; end if;
  if bid is null then bid:=item.business_id;elsif bid<>item.business_id then raise exception 'Checkout currently supports one business per order';end if;

  if p_delivery_method='SHIPPING' then delivery_total:=greatest(delivery_total,coalesce(item.shipping_fee,0)); end if;

  if item.variant_id is not null then
   if item.v_id is null or not item.v_available then raise exception 'A selected product option is unavailable';end if;
   if item.track_stock and not item.made_to_order then
    perform 1 from public.product_variants v where v.id=item.variant_id and v.product_id=item.product_id and v.available and v.stock_quantity-v.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient variant stock';end if;
   end if;
   item.unit_price:=coalesce(item.v_price,item.sale_price,item.price);
   insert into _checkout_items values(item.cart_item_id,item.product_id,item.variant_id,item.quantity,item.unit_price,item.name,item.business_id,jsonb_build_object('id',item.variant_id,'title',item.v_title,'options',item.v_options),item.track_stock,item.made_to_order);
  else
   if exists(select 1 from public.product_variants where product_id=item.product_id) then raise exception 'A product option must be selected';end if;
   if item.track_stock and not item.made_to_order then
    perform 1 from public.inventory i where i.product_id=item.product_id and i.stock_quantity-i.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient stock';end if;
   end if;
   item.unit_price:=coalesce(item.sale_price,item.price);
   insert into _checkout_items values(item.cart_item_id,item.product_id,null,item.quantity,item.unit_price,item.name,item.business_id,null,item.track_stock,item.made_to_order);
  end if;
  subtotal:=subtotal+(item.unit_price*item.quantity);
 end loop;
 if not exists(select 1 from _checkout_items) then raise exception 'Cart is empty';end if;

 subtotal:=round(subtotal,2);delivery_total:=round(delivery_total,2);total:=round(subtotal+delivery_total,2);onum:='EL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
 insert into public.orders(order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,delivery_address)
 values(onum,uid,bid,'PENDING','PENDING',subtotal,delivery_total,0,0,total,p_delivery_method,p_delivery_address) returning id into oid;
 update public.carts set active_checkout_order_id=oid,updated_at=now() where id=cid;

 for item in select * from _checkout_items loop
  if item.track_stock and not item.made_to_order then
   if item.variant_id is not null then update public.product_variants set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where id=item.variant_id;
   else update public.inventory set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where product_id=item.product_id;end if;
  end if;
  insert into public.order_items(order_id,product_id,variant_id,variant_snapshot,product_name,unit_price,quantity,line_total,source_cart_item_id,inventory_reservation)
  values(oid,item.product_id,item.variant_id,item.variant_snapshot,item.name,item.unit_price,item.quantity,round(item.unit_price*item.quantity,2),item.cart_item_id,case when not item.track_stock or item.made_to_order then 'NONE' when item.variant_id is not null then 'VARIANT' else 'PRODUCT' end);
 end loop;
 insert into public.payments(customer_id,order_id,amount,currency,status,idempotency_key) values(uid,oid,total,'aud','PENDING',p_idempotency_key);
 return jsonb_build_object('order_id',oid,'order_number',onum,'subtotal',subtotal,'delivery_fee',delivery_total,'total',total,'reused',false);
end $$;

create or replace function public.process_stripe_order_success(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o public.orders; item record; payment_id uuid; source_cart_id uuid;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if o.payment_status='SUCCEEDED' then return true; end if;
 if o.payment_status<>'PENDING' or o.status<>'PENDING' then raise exception 'Order is not payable'; end if;
 select id into payment_id from public.payments where order_id=o.id and status='PENDING' order by created_at desc limit 1 for update;
 if payment_id is null then raise exception 'Pending payment record not found'; end if;
 select id into source_cart_id from public.carts where customer_id=o.customer_id and active_checkout_order_id=o.id for update;
 for item in select * from public.order_items where order_id=o.id order by product_id,variant_id,id loop
  if item.inventory_reservation='VARIANT' then
   update public.product_variants set stock_quantity=stock_quantity-item.quantity,reserved_quantity=reserved_quantity-item.quantity,updated_at=now()
   where id=item.variant_id and product_id=item.product_id and stock_quantity>=item.quantity and reserved_quantity>=item.quantity;
   if not found then raise exception 'Variant inventory finalization failed'; end if;
  elsif item.inventory_reservation='PRODUCT' then
   update public.inventory set stock_quantity=stock_quantity-item.quantity,reserved_quantity=reserved_quantity-item.quantity,updated_at=now()
   where product_id=item.product_id and stock_quantity>=item.quantity and reserved_quantity>=item.quantity;
   if not found then raise exception 'Product inventory finalization failed'; end if;
  end if;
  -- Publication state reflects current inventory policy; settlement above uses
  -- the immutable reservation snapshot, even if the merchant changed policy.
  update public.products p set status='OUT_OF_STOCK',updated_at=now()
  where p.id=item.product_id and p.status='ACTIVE' and p.track_stock and not p.made_to_order
  and case when exists(select 1 from public.product_variants v where v.product_id=p.id)
   then not exists(select 1 from public.product_variants v where v.product_id=p.id and v.available and v.stock_quantity-v.reserved_quantity>0)
   else not exists(select 1 from public.inventory i where i.product_id=p.id and i.stock_quantity-i.reserved_quantity>0) end;
 end loop;
 update public.orders set payment_status='SUCCEEDED',status='PAYMENT_CONFIRMED',updated_at=now() where id=o.id;
 update public.payments set status='SUCCEEDED',updated_at=now() where id=payment_id;
 if source_cart_id is not null then
  update public.carts set active_checkout_order_id=null,updated_at=now() where id=source_cart_id;
  delete from public.cart_items ci where ci.cart_id=source_cart_id and ci.id in(select source_cart_item_id from public.order_items where order_id=o.id and source_cart_item_id is not null);
 end if;
 return true;
end $$;

create or replace function public.process_stripe_order_failure(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o public.orders; item record;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if o.payment_status<>'PENDING' then return true; end if;
 if o.status<>'PENDING' then raise exception 'Order is not pending'; end if;
 for item in select * from public.order_items where order_id=o.id order by product_id,variant_id,id loop
  if item.inventory_reservation='VARIANT' then
   update public.product_variants set reserved_quantity=reserved_quantity-item.quantity,updated_at=now()
   where id=item.variant_id and product_id=item.product_id and reserved_quantity>=item.quantity;
   if not found then raise exception 'Variant inventory release failed'; end if;
  elsif item.inventory_reservation='PRODUCT' then
   update public.inventory set reserved_quantity=reserved_quantity-item.quantity,updated_at=now()
   where product_id=item.product_id and reserved_quantity>=item.quantity;
   if not found then raise exception 'Product inventory release failed'; end if;
  end if;
 end loop;
 update public.orders set status='CANCELLED',payment_status='FAILED',updated_at=now() where id=o.id;
 update public.payments set status='FAILED',updated_at=now() where order_id=o.id and status='PENDING';
 update public.carts set active_checkout_order_id=null,updated_at=now() where customer_id=o.customer_id and active_checkout_order_id=o.id;
 return true;
end $$;
revoke all on function public.process_stripe_order_success(uuid) from public,anon,authenticated;
revoke all on function public.process_stripe_order_failure(uuid) from public,anon,authenticated;
grant execute on function public.process_stripe_order_success(uuid),public.process_stripe_order_failure(uuid) to service_role;

-- Persist the external-operation boundary BEFORE requesting Stripe. A network
-- timeout must not let another client release stock for a payable session.
create or replace function public.claim_order_checkout(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null or o.status<>'PENDING' or o.payment_status<>'PENDING' then raise exception 'Order is not payable'; end if;
 update public.orders set checkout_started_at=coalesce(checkout_started_at,now()) where id=o.id;
 return true;
end $$;
revoke all on function public.claim_order_checkout(uuid) from public,anon,authenticated;
grant execute on function public.claim_order_checkout(uuid) to service_role;

create or replace function public.release_my_order_reservations(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into o from public.orders where id=p_order_id and customer_id=auth.uid() for update;
 if o.id is null or o.status<>'PENDING' or o.payment_status<>'PENDING' then return false; end if;
 if o.checkout_started_at is not null or exists(select 1 from public.payments where order_id=o.id and status='PENDING' and nullif(provider_checkout_session_id,'') is not null) then
  raise exception 'Checkout is already in progress. Stripe must confirm failure or expiry before this order can be released';
 end if;
 return public.process_stripe_order_failure(o.id);
end $$;
revoke all on function public.release_my_order_reservations(uuid) from public,anon;
grant execute on function public.release_my_order_reservations(uuid) to authenticated;
revoke all on function public.create_order_from_cart(text,text,jsonb) from public,anon;
grant execute on function public.create_order_from_cart(text,text,jsonb) to authenticated;

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

    -- This locks the order and checks the persisted Stripe-request boundary.
    -- It also releases the captured inventory mode rather than today's flags.
    if not public.release_my_order_reservations(active_oid) then
      raise exception 'Checkout state changed. Refresh your cart before editing';
    end if;
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

-- Narrow, paid pickup-only completion. Existing delivery/dispatch RPCs unchanged.
create or replace function public.complete_pickup_order(p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if not (public.has_business_permission(o.business_id,'ORDERS_MANAGE') or public.is_admin()) then raise exception 'Not authorized'; end if;
 if o.payment_status<>'SUCCEEDED' or o.delivery_method<>'PICKUP' then raise exception 'Only paid pickup orders can be collected'; end if;
 if o.status='COMPLETED' then return true; end if;
 if o.status<>'READY_FOR_PICKUP' then raise exception 'Order is not ready for pickup'; end if;
 update public.orders set status='COMPLETED',updated_at=now() where id=o.id;
 return true;
end $$;
revoke all on function public.complete_pickup_order(uuid) from public,anon;
grant execute on function public.complete_pickup_order(uuid) to authenticated;
commit;
