-- A delivery failure/cancellation must not silently cancel a paid order.
-- Refunds require a separate verified payment/refund workflow; preserve the payment/order state until that exists.

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

  update public.deliveries set status=p_status,updated_at=now() where id=d.id;
  if p_status='PICKED_UP' then
    update public.delivery_assignments set accepted_at=coalesce(accepted_at,now()) where delivery_id=d.id;
    update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status='READY_FOR_PICKUP';
  elsif p_status='OUT_FOR_DELIVERY' then
    update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status in ('READY_FOR_PICKUP','OUT_FOR_DELIVERY');
  elsif p_status='DELIVERED' then
    update public.delivery_assignments set completed_at=now() where delivery_id=d.id;
    update public.orders set status='DELIVERED',updated_at=now() where id=d.order_id and status='OUT_FOR_DELIVERY';
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'UPDATE_DELIVERY_STATUS','DELIVERY',d.id,jsonb_build_object('from',d.status,'to',p_status));
  return true;
end; $$;

revoke execute on function public.update_delivery_status(uuid,public.delivery_status) from anon,authenticated;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;
