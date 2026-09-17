create or replace function public.release_my_order_reservations(p_order_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare oid uuid;
begin
 select id into oid from public.orders where id=p_order_id and customer_id=auth.uid() and status='PENDING' for update;
 if oid is null then return false; end if;
 update public.inventory i set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),updated_at=now() from public.order_items oi where oi.order_id=oid and oi.product_id=i.product_id;
 update public.orders set status='CANCELLED',payment_status='FAILED',updated_at=now() where id=oid;
 update public.payments set status='FAILED',updated_at=now() where order_id=oid and status='PENDING';
 return true;
end; $$;
grant execute on function public.release_my_order_reservations(uuid) to authenticated;
