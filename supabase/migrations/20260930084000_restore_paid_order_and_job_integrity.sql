-- Final launch hardening:
-- 1) paid product orders cannot be self-cancelled without refund reconciliation;
-- 2) failed/cancelled Everest Delivery returns a paid order to READY_FOR_PICKUP for retry;
-- 3) employee job completion must pass the authoritative booking payment guard.

create or replace function public.update_order_status(p_order_id uuid,p_next public.order_status)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  o public.orders;
  allowed boolean:=false;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Order not found'; end if;

  if not (public.has_business_permission(o.business_id,'ORDERS_MANAGE') or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if public.is_admin() then
    allowed:=true;
  else
    allowed:=(o.status,p_next) in (
      ('PAYMENT_CONFIRMED','ACCEPTED'),
      ('ACCEPTED','PREPARING'),
      ('PREPARING','READY_FOR_PICKUP'),
      ('READY_FOR_PICKUP','OUT_FOR_DELIVERY')
    );
  end if;

  if not allowed then
    if p_next='CANCELLED' and o.payment_status='SUCCEEDED' then
      raise exception 'Paid Everest orders require support cancellation so the payment can be reconciled';
    end if;
    raise exception 'Invalid order transition';
  end if;

  update public.orders set status=p_next,updated_at=now() where id=p_order_id;
  return true;
end
$$;

revoke all on function public.update_order_status(uuid,public.order_status) from public,anon;
grant execute on function public.update_order_status(uuid,public.order_status) to authenticated;


create or replace function public.update_delivery_status(p_delivery_id uuid,p_status public.delivery_status)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  d public.deliveries;
begin
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;

  if not public.is_admin() then
    perform public.refresh_driver_verification_status(auth.uid());
    if not public.driver_is_operational(auth.uid()) then
      raise exception 'Verified driver access is required';
    end if;
    if not exists(
      select 1 from public.delivery_assignments
      where delivery_id=d.id and driver_id=auth.uid()
    ) then
      raise exception 'This delivery is not assigned to you';
    end if;
    if d.status='ASSIGNED' and p_status='PICKED_UP' and not exists(
      select 1 from public.delivery_assignments
      where delivery_id=d.id and driver_id=auth.uid() and accepted_at is not null
    ) then
      raise exception 'Accept the delivery before pickup';
    end if;
  end if;

  if (d.status,p_status) not in (
    ('PENDING','ACCEPTED'),('PENDING','CANCELLED'),
    ('ACCEPTED','PREPARING'),('ACCEPTED','CANCELLED'),
    ('PREPARING','READY_FOR_PICKUP'),('PREPARING','CANCELLED'),
    ('ASSIGNED','PICKED_UP'),('ASSIGNED','CANCELLED'),
    ('PICKED_UP','OUT_FOR_DELIVERY'),
    ('OUT_FOR_DELIVERY','DELIVERED'),('OUT_FOR_DELIVERY','FAILED')
  ) then
    raise exception 'Invalid delivery transition';
  end if;

  update public.deliveries set status=p_status,updated_at=now() where id=d.id;

  if p_status='PICKED_UP' then
    update public.orders
    set status='OUT_FOR_DELIVERY',updated_at=now()
    where id=d.order_id and status='READY_FOR_PICKUP';
  elsif p_status='OUT_FOR_DELIVERY' then
    update public.orders
    set status='OUT_FOR_DELIVERY',updated_at=now()
    where id=d.order_id and status in ('READY_FOR_PICKUP','OUT_FOR_DELIVERY');
  elsif p_status='DELIVERED' then
    update public.delivery_assignments
    set completed_at=coalesce(completed_at,now())
    where delivery_id=d.id;
    update public.orders
    set status='DELIVERED',updated_at=now()
    where id=d.order_id and status='OUT_FOR_DELIVERY';
  elsif p_status in ('FAILED','CANCELLED') then
    update public.delivery_assignments
    set completed_at=coalesce(completed_at,now())
    where delivery_id=d.id;
    update public.orders
    set status='READY_FOR_PICKUP',updated_at=now()
    where id=d.order_id
      and payment_status='SUCCEEDED'
      and status not in ('DELIVERED','COMPLETED','REFUNDED');
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'UPDATE_DELIVERY_STATUS','DELIVERY',d.id,
    jsonb_build_object('from',d.status,'to',p_status)
  );

  return true;
end
$$;

revoke all on function public.update_delivery_status(uuid,public.delivery_status) from public,anon;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;


create or replace function public.request_delivery_for_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  o public.orders;
  bid uuid;
  did uuid;
  existing_status public.delivery_status;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Order not found'; end if;

  if not (
    public.has_business_permission(o.business_id,'ORDERS_MANAGE')
    or public.is_admin()
  ) then
    raise exception 'Not authorized';
  end if;

  if o.payment_status<>'SUCCEEDED' then raise exception 'Payment must be confirmed first'; end if;
  if o.delivery_method not in ('EVEREST_DELIVERY','SAME_DAY') then
    raise exception 'Order is not configured for Everest Delivery';
  end if;
  if o.status<>'READY_FOR_PICKUP' then raise exception 'Order must be ready for pickup first'; end if;
  if o.delivery_address is null then raise exception 'Delivery address is required'; end if;

  select d.status into existing_status
  from public.deliveries d
  where d.order_id=o.id
  for update;

  if existing_status is not null
     and existing_status not in ('PENDING','READY_FOR_PICKUP','FAILED','CANCELLED') then
    raise exception 'Delivery request is already in progress or completed';
  end if;

  select id into bid from public.businesses where id=o.business_id;

  insert into public.deliveries(order_id,status,pickup_location,customer_location,fee)
  values(
    o.id,'READY_FOR_PICKUP',jsonb_build_object('business_id',bid),o.delivery_address,o.delivery_fee
  )
  on conflict(order_id) do update
  set status='READY_FOR_PICKUP',
      customer_location=excluded.customer_location,
      fee=excluded.fee,
      updated_at=now();

  select id into did from public.deliveries where order_id=o.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'REQUEST_DELIVERY','DELIVERY',did,jsonb_build_object('order_id',o.id));

  return did;
end
$$;

revoke all on function public.request_delivery_for_order(uuid) from public,anon;
grant execute on function public.request_delivery_for_order(uuid) to authenticated;


create or replace function public.update_business_job_assignment_status(
  p_assignment_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.business_job_assignments;
  v_status text:=upper(coalesce(p_status,''));
  v_own boolean:=false;
  v_allowed boolean:=false;
  v_booking_status public.booking_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into a
  from public.business_job_assignments
  where id=p_assignment_id
  for update;

  if a.id is null then raise exception 'Assignment not found'; end if;

  v_own:=a.assigned_user_id=auth.uid() or exists(
    select 1
    from public.business_team_members tm
    join public.business_members bm
      on bm.business_id=tm.business_id
     and bm.user_id=tm.user_id
     and bm.status='ACTIVE'
    where tm.business_id=a.business_id
      and tm.team_id=a.team_id
      and tm.user_id=auth.uid()
  );

  if not (
    v_own
    or public.has_business_permission(a.business_id,'JOB_UPDATE_ALL')
    or public.is_admin()
  ) then
    raise exception 'Not authorized';
  end if;

  if v_status not in (
    'ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','DECLINED','CANCELLED'
  ) then
    raise exception 'Invalid assignment status';
  end if;

  if public.has_business_permission(a.business_id,'JOB_UPDATE_ALL') or public.is_admin() then
    v_allowed:=true;
  elsif v_own then
    v_allowed:=
      (a.status='ASSIGNED' and v_status in ('ACCEPTED','DECLINED'))
      or (a.status='ACCEPTED' and v_status='EN_ROUTE')
      or (a.status='EN_ROUTE' and v_status='ARRIVED')
      or (a.status='ARRIVED' and v_status='IN_PROGRESS')
      or (a.status='IN_PROGRESS' and v_status='COMPLETED');
  end if;

  if not v_allowed then raise exception 'Invalid assignment transition'; end if;

  -- Marketplace booking state is authoritative. Do not let the work queue
  -- bypass payment/completion guards by writing bookings directly.
  if a.booking_id is not null and v_status in ('EN_ROUTE','IN_PROGRESS','COMPLETED') then
    select b.status into v_booking_status
    from public.bookings b
    where b.id=a.booking_id
    for update;

    if v_booking_status is null then raise exception 'Booking not found'; end if;

    if v_status='EN_ROUTE' and v_booking_status='CONFIRMED' then
      perform public.update_booking_status(a.booking_id,'UPCOMING');
    elsif v_status='IN_PROGRESS' and v_booking_status='UPCOMING' then
      perform public.update_booking_status(a.booking_id,'IN_PROGRESS');
    elsif v_status='COMPLETED' and v_booking_status='IN_PROGRESS' then
      perform public.update_booking_status(a.booking_id,'COMPLETED');
    elsif v_status='COMPLETED' and v_booking_status<>'COMPLETED' then
      raise exception 'Booking must be in progress before assignment completion';
    end if;
  end if;

  update public.business_job_assignments
  set status=v_status,
      accepted_at=case when v_status='ACCEPTED' then coalesce(accepted_at,now()) else accepted_at end,
      en_route_at=case when v_status='EN_ROUTE' then coalesce(en_route_at,now()) else en_route_at end,
      arrived_at=case when v_status='ARRIVED' then coalesce(arrived_at,now()) else arrived_at end,
      started_at=case when v_status='IN_PROGRESS' then coalesce(started_at,now()) else started_at end,
      completed_at=case when v_status='COMPLETED' then coalesce(completed_at,now()) else completed_at end,
      cancelled_at=case when v_status in ('DECLINED','CANCELLED') then coalesce(cancelled_at,now()) else cancelled_at end,
      updated_at=now()
  where id=a.id;

  if a.booking_id is not null then
    if v_status in ('EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED') then
      insert into public.booking_job_records(
        booking_id,business_id,customer_id,arrival_status,started_at,completed_at
      )
      select
        b.id,b.business_id,b.customer_id,
        case v_status
          when 'EN_ROUTE' then 'ON_MY_WAY'
          when 'ARRIVED' then 'ARRIVED'
          when 'IN_PROGRESS' then 'IN_PROGRESS'
          else 'COMPLETED'
        end,
        case when v_status in ('IN_PROGRESS','COMPLETED') then now() end,
        case when v_status='COMPLETED' then now() end
      from public.bookings b
      where b.id=a.booking_id
      on conflict(booking_id) do update
      set arrival_status=excluded.arrival_status,
          started_at=coalesce(public.booking_job_records.started_at,excluded.started_at),
          completed_at=coalesce(excluded.completed_at,public.booking_job_records.completed_at),
          updated_at=now();
    end if;
  elsif a.crm_booking_id is not null then
    if v_status='IN_PROGRESS' then
      update public.crm_bookings
      set status='IN_PROGRESS',updated_at=now()
      where id=a.crm_booking_id and status in ('TENTATIVE','CONFIRMED','IN_PROGRESS');
    elsif v_status='COMPLETED' then
      update public.crm_bookings
      set status='COMPLETED',
          completed_at=coalesce(completed_at,now()),
          updated_at=now()
      where id=a.crm_booking_id and status in ('IN_PROGRESS','COMPLETED');
    end if;
  end if;

  insert into public.business_job_events(
    business_id,assignment_id,booking_id,crm_booking_id,actor_id,kind,detail
  )
  values(
    a.business_id,a.id,a.booking_id,a.crm_booking_id,auth.uid(),v_status,'{}'::jsonb
  );

  return true;
end
$$;

revoke all on function public.update_business_job_assignment_status(uuid,text) from public,anon;
grant execute on function public.update_business_job_assignment_status(uuid,text) to authenticated;
