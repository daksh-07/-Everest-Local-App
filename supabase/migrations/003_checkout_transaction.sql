-- Atomic cart-to-order creation. Pricing and inventory are read under row locks.
create or replace function public.create_order_from_cart(p_idempotency_key text,p_delivery_method text default 'PICKUP',p_delivery_address jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); cid uuid; item record; bid uuid; subtotal numeric:=0; total numeric; oid uuid; onum text;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if length(coalesce(p_idempotency_key,''))<12 then raise exception 'Invalid idempotency key'; end if;
 select id into cid from public.carts where customer_id=uid for update;
 if cid is null then raise exception 'Cart is empty'; end if;
 select o.id,o.order_number into oid,onum from public.orders o join public.payments p on p.order_id=o.id where p.idempotency_key=p_idempotency_key limit 1;
 if oid is not null then return jsonb_build_object('order_id',oid,'order_number',onum,'reused',true); end if;
 create temporary table if not exists _checkout_items(product_id uuid,quantity integer,unit_price numeric,name text,business_id uuid) on commit drop;
 delete from _checkout_items;
 for item in select ci.product_id,ci.quantity,p.name,p.price,p.sale_price,p.status,p.business_id from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cid loop
   if item.status<>'ACTIVE' then raise exception 'A product is no longer available'; end if;
   if bid is null then bid:=item.business_id; elsif bid<>item.business_id then raise exception 'Checkout currently supports one business per order'; end if;
   perform 1 from public.inventory i where i.product_id=item.product_id and i.stock_quantity-i.reserved_quantity>=item.quantity for update;
   if not found then raise exception 'Insufficient stock'; end if;
   item.unit_price:=coalesce(item.sale_price,item.price); subtotal:=subtotal+(item.unit_price*item.quantity);
   insert into _checkout_items values(item.product_id,item.quantity,item.unit_price,item.name,item.business_id);
 end loop;
 if not exists(select 1 from _checkout_items) then raise exception 'Cart is empty'; end if;
 total:=round(subtotal,2); onum:='EL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
 insert into public.orders(order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,delivery_address) values(onum,uid,bid,'PENDING','PENDING',subtotal,0,0,0,total,p_delivery_method,p_delivery_address) returning id into oid;
 for item in select * from _checkout_items loop
   update public.inventory set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where product_id=item.product_id;
   insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total) values(oid,item.product_id,item.name,item.unit_price,item.quantity,item.unit_price*item.quantity);
 end loop;
 insert into public.payments(customer_id,order_id,amount,currency,status,idempotency_key) values(uid,oid,total,'aud','PENDING',p_idempotency_key);
 return jsonb_build_object('order_id',oid,'order_number',onum,'total',total,'reused',false);
end; $$;

create or replace function public.release_order_reservations(p_order_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Not authorized'; end if;
 update public.inventory i set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),updated_at=now() from public.order_items oi where oi.order_id=p_order_id and oi.product_id=i.product_id;
 return true;
end; $$;

grant execute on function public.create_order_from_cart(text,text,jsonb) to authenticated;
revoke execute on function public.release_order_reservations(uuid) from anon,authenticated;
