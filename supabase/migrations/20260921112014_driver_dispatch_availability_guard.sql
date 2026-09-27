-- Require an explicitly ONLINE, non-busy operational driver for delivery assignment.
-- The partial unique index also makes concurrent active-driver assignment impossible at the database level.
create unique index if not exists delivery_assignments_one_active_job_per_driver_idx
on public.delivery_assignments(driver_id)
where accepted_at is not null and completed_at is null;

create or replace function public.assign_delivery_driver(p_delivery_id uuid, p_driver_id uuid)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare d public.deliveries; availability public.driver_availability;
begin
 if not public.is_admin() then raise exception 'Admin authorization required'; end if;
 perform public.refresh_driver_verification_status(p_driver_id);
 select * into d from public.deliveries where id=p_delivery_id for update;
 if d.id is null then raise exception 'Delivery not found'; end if;
 if d.status<>'READY_FOR_PICKUP' then raise exception 'Delivery must be ready for pickup before assignment'; end if;
 if not public.driver_is_operational(p_driver_id) then raise exception 'Selected user is not an active verified delivery driver'; end if;
 select * into availability from public.driver_availability where driver_id=p_driver_id for update;
 if availability.driver_id is null or availability.status<>'ONLINE' then raise exception 'Driver is not available for new jobs'; end if;
 if exists(select 1 from public.delivery_assignments where driver_id=p_driver_id and accepted_at is not null and completed_at is null) then raise exception 'Driver already has an active delivery'; end if;
 insert into public.delivery_assignments(delivery_id,driver_id,assigned_at)
 values(d.id,p_driver_id,now())
 on conflict(delivery_id) do update set driver_id=excluded.driver_id,assigned_at=now(),accepted_at=null,completed_at=null;
 update public.deliveries set status='ASSIGNED',updated_at=now() where id=d.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'ASSIGN_DELIVERY_DRIVER','DELIVERY',d.id,jsonb_build_object('driver_id',p_driver_id));
 insert into public.notifications(user_id,kind,title,body,data)
 values(p_driver_id,'DELIVERY_ASSIGNED','New delivery assigned','A new Everest delivery has been assigned to you.',jsonb_build_object('delivery_id',d.id,'order_id',d.order_id));
 return true;
end;
$$;
revoke all on function public.assign_delivery_driver(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_delivery_driver(uuid,uuid) to authenticated;