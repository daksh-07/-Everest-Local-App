-- Complete the real delivery operational path without exposing privileged table writes.
-- Businesses may request delivery for their own paid, delivery-eligible orders.
-- Admins assign a real DELIVERY_DRIVER account. Drivers/admins then advance delivery state.

create or replace function public.request_delivery_for_order(p_order_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  o public.orders;
  bid uuid;
  did uuid;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if not (public.is_business_member(o.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  if o.payment_status <> 'SUCCEEDED' then raise exception 'Payment must be confirmed first'; end if;
  if o.delivery_method not in ('EVEREST_DELIVERY','SAME_DAY') then raise exception 'Order is not configured for Everest Delivery'; end if;
  if o.status <> 'READY_FOR_PICKUP' then raise exception 'Order must be ready for pickup first'; end if;
  if o.delivery_address is null then raise exception 'Delivery address is required'; end if;

  select id into bid from public.businesses where id=o.business_id;
  insert into public.deliveries(order_id,status,pickup_location,customer_location,fee)
  values(o.id,'READY_FOR_PICKUP',jsonb_build_object('business_id',bid),o.delivery_address,o.delivery_fee)
  on conflict(order_id) do update
    set customer_location=excluded.customer_location,
        fee=excluded.fee,
        updated_at=now()
  returning id into did;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'REQUEST_DELIVERY','DELIVERY',did,jsonb_build_object('order_id',o.id));
  return did;
end; $$;
revoke execute on function public.request_delivery_for_order(uuid) from anon;
grant execute on function public.request_delivery_for_order(uuid) to authenticated;

create or replace function public.assign_delivery_driver(p_delivery_id uuid,p_driver_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  d public.deliveries;
  driver_role public.app_role;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if d.status <> 'READY_FOR_PICKUP' then raise exception 'Delivery must be ready for pickup before assignment'; end if;
  select role into driver_role from public.profiles where id=p_driver_id;
  if driver_role <> 'DELIVERY_DRIVER' then raise exception 'Selected user is not a delivery driver'; end if;

  insert into public.delivery_assignments(delivery_id,driver_id,assigned_at)
  values(d.id,p_driver_id,now())
  on conflict(delivery_id) do update set driver_id=excluded.driver_id,assigned_at=now(),accepted_at=null,completed_at=null;

  update public.deliveries set status='ASSIGNED',updated_at=now() where id=d.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'ASSIGN_DELIVERY_DRIVER','DELIVERY',d.id,jsonb_build_object('driver_id',p_driver_id));
  return true;
end; $$;
revoke execute on function public.assign_delivery_driver(uuid,uuid) from anon;
grant execute on function public.assign_delivery_driver(uuid,uuid) to authenticated;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status public.delivery_status) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  d public.deliveries;
  is_driver boolean:=false;
  valid boolean:=false;
begin
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  is_driver:=exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid());
  if not (public.is_admin() or is_driver) then raise exception 'Not authorized'; end if;

  valid:=case
    when d.status='PENDING' and p_status in ('ACCEPTED','CANCELLED') then true
    when d.status='ACCEPTED' and p_status in ('PREPARING','CANCELLED') then true
    when d.status='PREPARING' and p_status in ('READY_FOR_PICKUP','CANCELLED') then true
    when d.status='ASSIGNED' and p_status in ('PICKED_UP','CANCELLED') then true
    when d.status='PICKED_UP' and p_status='OUT_FOR_DELIVERY' then true
    when d.status='OUT_FOR_DELIVERY' and p_status in ('DELIVERED','FAILED') then true
    else false end;
  if not valid then raise exception 'Invalid delivery transition'; end if;

  update public.deliveries
  set status=p_status,
      updated_at=now()
  where id=d.id;

  if p_status='PICKED_UP' then
    update public.delivery_assignments set accepted_at=coalesce(accepted_at,now()) where delivery_id=d.id;
    update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status='READY_FOR_PICKUP';
  elsif p_status='OUT_FOR_DELIVERY' then
    update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status in ('READY_FOR_PICKUP','OUT_FOR_DELIVERY');
  elsif p_status='DELIVERED' then
    update public.delivery_assignments set completed_at=now() where delivery_id=d.id;
    update public.orders set status='DELIVERED',updated_at=now() where id=d.order_id and status='OUT_FOR_DELIVERY';
  elsif p_status='FAILED' then
    update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED');
  elsif p_status='CANCELLED' then
    update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED');
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'UPDATE_DELIVERY_STATUS','DELIVERY',d.id,jsonb_build_object('from',d.status,'to',p_status));
  return true;
end; $$;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;
