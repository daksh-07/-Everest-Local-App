-- Make Stripe event processing durable and delivery/order states consistent.
create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'PROCESSING' check(status in ('PROCESSING','SUCCEEDED','FAILED')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_events enable row level security;

create or replace function public.claim_stripe_event(p_event_id text,p_event_type text) returns boolean language plpgsql security definer set search_path=public as $$
declare current_status text; inserted boolean:=false;
begin
 if p_event_id is null or length(p_event_id)<5 then raise exception 'Invalid Stripe event'; end if;
 insert into public.stripe_events(event_id,event_type,status) values(p_event_id,p_event_type,'PROCESSING') on conflict do nothing;
 if found then return true; end if;
 select status into current_status from public.stripe_events where event_id=p_event_id for update;
 return current_status='FAILED';
end; $$;
revoke execute on function public.claim_stripe_event(text,text) from anon,authenticated;
grant execute on function public.claim_stripe_event(text,text) to service_role;

create or replace function public.finish_stripe_event(p_event_id text,p_success boolean) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.stripe_events set status=case when p_success then 'SUCCEEDED' else 'FAILED' end,processed_at=case when p_success then now() else null end where event_id=p_event_id;
 return found;
end; $$;
revoke execute on function public.finish_stripe_event(text,boolean) from anon,authenticated;
grant execute on function public.finish_stripe_event(text,boolean) to service_role;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status public.delivery_status) returns boolean language plpgsql security definer set search_path=public as $$
declare d public.deliveries; valid boolean:=false; is_driver boolean:=false;
begin
 select * into d from public.deliveries where id=p_delivery_id for update;
 if d.id is null then raise exception 'Delivery not found'; end if;
 is_driver:=exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid());
 if not (public.is_admin() or is_driver) then raise exception 'Not authorized'; end if;
 valid:=case when d.status='PENDING' and p_status in ('ACCEPTED','CANCELLED') then true when d.status='ACCEPTED' and p_status in ('PREPARING','CANCELLED') then true when d.status='PREPARING' and p_status in ('READY_FOR_PICKUP','CANCELLED') then true when d.status='READY_FOR_PICKUP' and p_status in ('ASSIGNED','CANCELLED') then true when d.status='ASSIGNED' and p_status in ('PICKED_UP','CANCELLED') then true when d.status='PICKED_UP' and p_status='OUT_FOR_DELIVERY' then true when d.status='OUT_FOR_DELIVERY' and p_status in ('DELIVERED','FAILED') then true else false end;
 if not valid then raise exception 'Invalid delivery transition'; end if;
 update public.deliveries set status=p_status,updated_at=now() where id=d.id;
 if p_status='READY_FOR_PICKUP' then update public.orders set status='READY_FOR_PICKUP',updated_at=now() where id=d.order_id and status in ('ACCEPTED','PREPARING','READY_FOR_PICKUP');
 elsif p_status='OUT_FOR_DELIVERY' then update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status='READY_FOR_PICKUP';
 elsif p_status='DELIVERED' then update public.orders set status='DELIVERED',updated_at=now() where id=d.order_id and status='OUT_FOR_DELIVERY';
 elsif p_status='CANCELLED' then update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED'); end if;
 return true;
end; $$;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;

create or replace function public.update_order_status(p_order_id uuid,p_next public.order_status) returns boolean language plpgsql security definer set search_path=public as $$
declare o public.orders; allowed boolean:=false;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if not (public.is_business_member(o.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
 allowed:=(o.status,p_next) in (('PAYMENT_CONFIRMED','ACCEPTED'),('ACCEPTED','PREPARING'),('PREPARING','READY_FOR_PICKUP'),('PAYMENT_CONFIRMED','CANCELLED'),('ACCEPTED','CANCELLED'),('PREPARING','CANCELLED'),('READY_FOR_PICKUP','CANCELLED'));
 if o.delivery_method in ('EVEREST_DELIVERY','SAME_DAY') and p_next='OUT_FOR_DELIVERY' then raise exception 'Everest Delivery must control the out-for-delivery transition'; end if;
 if not allowed then raise exception 'Invalid order transition'; end if;
 update public.orders set status=p_next,updated_at=now() where id=p_order_id;
 return true;
end; $$;
grant execute on function public.update_order_status(uuid,public.order_status) to authenticated;
