create or replace function public.accept_delivery_assignment(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare d public.deliveries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.refresh_driver_verification_status(auth.uid());
  if not public.driver_is_operational(auth.uid()) then raise exception 'Verified driver access is required'; end if;
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if d.status<>'ASSIGNED' then raise exception 'Delivery is not awaiting driver acceptance'; end if;
  if not exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid()) then raise exception 'This delivery is not assigned to you'; end if;
  update public.delivery_assignments set accepted_at=now() where delivery_id=d.id and driver_id=auth.uid() and accepted_at is null;
  if not found then raise exception 'Delivery has already been accepted'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ACCEPT_DELIVERY_ASSIGNMENT','DELIVERY',d.id,jsonb_build_object('order_id',d.order_id));
  return true;
end;
$$;
revoke execute on function public.accept_delivery_assignment(uuid) from public,anon;
grant execute on function public.accept_delivery_assignment(uuid) to authenticated;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status public.delivery_status) returns boolean
language plpgsql security definer set search_path=public
as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if not public.is_admin() then
    perform public.refresh_driver_verification_status(auth.uid());
    if not public.driver_is_operational(auth.uid()) then raise exception 'Verified driver access is required'; end if;
    if not exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid()) then raise exception 'This delivery is not assigned to you'; end if;
    if d.status='ASSIGNED' and p_status='PICKED_UP' and not exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid() and accepted_at is not null) then raise exception 'Accept the delivery before pickup'; end if;
  end if;
  if (d.status,p_status) not in (('PENDING','ACCEPTED'),('PENDING','CANCELLED'),('ACCEPTED','PREPARING'),('ACCEPTED','CANCELLED'),('PREPARING','READY_FOR_PICKUP'),('PREPARING','CANCELLED'),('ASSIGNED','PICKED_UP'),('ASSIGNED','CANCELLED'),('PICKED_UP','OUT_FOR_DELIVERY'),('OUT_FOR_DELIVERY','DELIVERED'),('OUT_FOR_DELIVERY','FAILED')) then raise exception 'Invalid delivery transition'; end if;
  update public.deliveries set status=p_status,updated_at=now() where id=d.id;
  if p_status='PICKED_UP' then update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status='READY_FOR_PICKUP';
  elsif p_status='OUT_FOR_DELIVERY' then update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status in ('READY_FOR_PICKUP','OUT_FOR_DELIVERY');
  elsif p_status='DELIVERED' then update public.delivery_assignments set completed_at=now() where delivery_id=d.id; update public.orders set status='DELIVERED',updated_at=now() where id=d.order_id and status='OUT_FOR_DELIVERY';
  elsif p_status='FAILED' then update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED');
  elsif p_status='CANCELLED' then update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED'); end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'UPDATE_DELIVERY_STATUS','DELIVERY',d.id,jsonb_build_object('from',d.status,'to',p_status));
  return true;
end;
$$;
revoke execute on function public.update_delivery_status(uuid,public.delivery_status) from public,anon;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;