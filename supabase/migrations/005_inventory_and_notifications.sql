create or replace function public.finalize_inventory_sale(p_product_id uuid,p_quantity integer) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if p_quantity<=0 then raise exception 'Invalid quantity'; end if;
 update public.inventory set stock_quantity=stock_quantity-p_quantity,reserved_quantity=greatest(0,reserved_quantity-p_quantity),updated_at=now() where product_id=p_product_id and stock_quantity>=p_quantity and reserved_quantity>=p_quantity;
 if not found then raise exception 'Inventory finalization failed'; end if;
 update public.products set status='OUT_OF_STOCK',updated_at=now() where id=p_product_id and not exists(select 1 from public.inventory where product_id=p_product_id and stock_quantity-reserved_quantity>0);
 return true;
end; $$;
revoke execute on function public.finalize_inventory_sale(uuid,integer) from anon,authenticated;

-- Common notification trigger. It records state changes without exposing private data.
create or replace function public.notify_order_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from new.status then
   insert into public.notifications(user_id,kind,title,body,data) values(new.customer_id,'ORDER_STATUS','Order updated','Your order status has changed.',jsonb_build_object('order_id',new.id,'status',new.status));
 end if;
 return new;
end; $$;
drop trigger if exists orders_notify on public.orders;
create trigger orders_notify after update on public.orders for each row execute function public.notify_order_change();
