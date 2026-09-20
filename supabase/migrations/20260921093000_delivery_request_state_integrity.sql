create or replace function public.request_delivery_for_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  bid uuid;
  did uuid;
  existing_status public.delivery_status;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if not (public.is_business_member(o.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  if o.payment_status <> 'SUCCEEDED' then raise exception 'Payment must be confirmed first'; end if;
  if o.delivery_method not in ('EVEREST_DELIVERY','SAME_DAY') then raise exception 'Order is not configured for Everest Delivery'; end if;
  if o.status <> 'READY_FOR_PICKUP' then raise exception 'Order must be ready for pickup first'; end if;
  if o.delivery_address is null then raise exception 'Delivery address is required'; end if;

  select d.status into existing_status
  from public.deliveries d
  where d.order_id=o.id
  for update;

  if existing_status is not null and existing_status not in ('PENDING','READY_FOR_PICKUP') then
    raise exception 'Delivery request is already in progress or completed';
  end if;

  select id into bid from public.businesses where id=o.business_id;
  insert into public.deliveries(order_id,status,pickup_location,customer_location,fee)
  values(o.id,'READY_FOR_PICKUP',jsonb_build_object('business_id',bid),o.delivery_address,o.delivery_fee)
  on conflict(order_id) do update
    set status='READY_FOR_PICKUP',
        customer_location=excluded.customer_location,
        fee=excluded.fee,
        updated_at=now();

  select id into did from public.deliveries where order_id=o.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'REQUEST_DELIVERY','DELIVERY',did,jsonb_build_object('order_id',o.id));
  return did;
end; $$;
revoke execute on function public.request_delivery_for_order(uuid) from anon;
grant execute on function public.request_delivery_for_order(uuid) to authenticated;
