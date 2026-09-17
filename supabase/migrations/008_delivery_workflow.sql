create or replace function public.create_delivery_for_order(p_order_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare did uuid; o public.orders;
begin
 if not public.is_admin() then raise exception 'Admin authorization required'; end if;
 select * into o from public.orders where id=p_order_id;
 if o.id is null then raise exception 'Order not found'; end if;
 if o.payment_status<>'SUCCEEDED' then raise exception 'Payment must be confirmed first'; end if;
 if o.delivery_method not in ('EVEREST_DELIVERY','SAME_DAY') then raise exception 'Order is not configured for Everest Delivery'; end if;
 insert into public.deliveries(order_id,status,customer_location) values(o.id,'PENDING',o.delivery_address) on conflict(order_id) do update set updated_at=now() returning id into did;
 return did;
end; $$;

grant execute on function public.create_delivery_for_order(uuid) to authenticated;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status public.delivery_status) returns boolean language plpgsql security definer set search_path=public as $$
declare d public.deliveries;
valid boolean:=false;
begin
 select * into d from public.deliveries where id=p_delivery_id for update;
 if d.id is null then raise exception 'Delivery not found'; end if;
 if not (public.is_admin() or exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid())) then raise exception 'Not authorized'; end if;
 valid:=case when d.status='PENDING' and p_status in ('ACCEPTED','CANCELLED') then true when d.status='ACCEPTED' and p_status in ('PREPARING','CANCELLED') then true when d.status='PREPARING' and p_status in ('READY_FOR_PICKUP','CANCELLED') then true when d.status='READY_FOR_PICKUP' and p_status in ('ASSIGNED','CANCELLED') then true when d.status='ASSIGNED' and p_status in ('PICKED_UP','CANCELLED') then true when d.status='PICKED_UP' and p_status='OUT_FOR_DELIVERY' then true when d.status='OUT_FOR_DELIVERY' and p_status in ('DELIVERED','FAILED') then true else false end;
 if not valid and not public.is_admin() then raise exception 'Invalid delivery transition'; end if;
 update public.deliveries set status=p_status,updated_at=now() where id=d.id;
 if p_status='DELIVERED' then update public.orders set status='DELIVERED',updated_at=now() where id=d.order_id; end if;
 return true;
end; $$;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;
