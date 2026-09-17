-- Stripe processing must update payment state and inventory atomically.
-- Webhook retries may safely re-enter these functions.

create or replace function public.claim_stripe_event(p_event_id text,p_event_type text) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare current_status text; started_at timestamptz;
begin
 if p_event_id is null or length(p_event_id)<5 then raise exception 'Invalid Stripe event'; end if;
 insert into public.stripe_events(event_id,event_type,status) values(p_event_id,p_event_type,'PROCESSING') on conflict do nothing;
 if found then return true; end if;
 select status,created_at into current_status,started_at from public.stripe_events where event_id=p_event_id for update;
 if current_status='SUCCEEDED' then return false; end if;
 if current_status='FAILED' or (current_status='PROCESSING' and started_at < now()-interval '10 minutes') then
   update public.stripe_events set event_type=p_event_type,status='PROCESSING',created_at=now(),processed_at=null where event_id=p_event_id;
   return true;
 end if;
 return false;
end;
$$;
revoke execute on function public.claim_stripe_event(text,text) from anon,authenticated;
grant execute on function public.claim_stripe_event(text,text) to service_role;

create or replace function public.process_stripe_order_success(p_order_id uuid) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare o public.orders; item record; payment_id uuid;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if o.payment_status='SUCCEEDED' then return true; end if;
 if o.payment_status<>'PENDING' or o.status<>'PENDING' then raise exception 'Order is not payable'; end if;

 select id into payment_id from public.payments where order_id=o.id and status='PENDING' order by created_at desc limit 1 for update;
 if payment_id is null then raise exception 'Pending payment record not found'; end if;

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

 update public.orders set payment_status='SUCCEEDED',status='PAYMENT_CONFIRMED',updated_at=now() where id=o.id;
 update public.payments set status='SUCCEEDED',updated_at=now() where id=payment_id;
 return true;
end;
$$;
revoke execute on function public.process_stripe_order_success(uuid) from anon,authenticated;
grant execute on function public.process_stripe_order_success(uuid) to service_role;

create or replace function public.process_stripe_order_failure(p_order_id uuid) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if o.payment_status='SUCCEEDED' then return true; end if;
 if o.payment_status='FAILED' and o.status='CANCELLED' then return true; end if;
 if o.payment_status<>'PENDING' then return true; end if;

 update public.inventory i
 set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),updated_at=now()
 from public.order_items oi
 where oi.order_id=o.id and oi.product_id=i.product_id;
 update public.orders set status='CANCELLED',payment_status='FAILED',updated_at=now() where id=o.id and payment_status='PENDING';
 update public.payments set status='FAILED',updated_at=now() where order_id=o.id and status='PENDING';
 return true;
end;
$$;
revoke execute on function public.process_stripe_order_failure(uuid) from anon,authenticated;
grant execute on function public.process_stripe_order_failure(uuid) to service_role;
