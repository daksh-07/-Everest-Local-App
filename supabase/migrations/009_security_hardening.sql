-- Security hardening pass: remove client-controlled role/verification/membership changes,
-- tighten booking/order lifecycle permissions, and provide safe profile/inventory operations.

revoke update on public.profiles from authenticated;
revoke insert, update, delete on public.business_members from authenticated;

create or replace function public.update_my_profile(p_full_name text default null,p_phone text default null,p_suburb text default null,p_city text default null,p_state text default null) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update public.profiles set full_name=nullif(trim(p_full_name),''),phone=nullif(trim(p_phone),''),suburb=nullif(trim(p_suburb),''),city=nullif(trim(p_city),''),state=nullif(trim(p_state),''),updated_at=now() where id=auth.uid();
 return found;
end; $$;
grant execute on function public.update_my_profile(text,text,text,text,text) to authenticated;

create or replace function public.guard_business_security_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then
   if new.owner_id is distinct from old.owner_id then raise exception 'Business ownership cannot be changed by a business user'; end if;
   if new.verification_status is distinct from old.verification_status then raise exception 'Verification status is admin-controlled'; end if;
 end if;
 return new;
end; $$;
drop trigger if exists business_security_guard on public.businesses;
create trigger business_security_guard before update on public.businesses for each row execute function public.guard_business_security_fields();

create or replace function public.update_booking_status(p_booking_id uuid,p_next public.booking_status) returns boolean language plpgsql security definer set search_path=public as $$
declare b public.bookings; allowed boolean:=false; caller_business boolean:=false;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 caller_business:=public.is_business_member(b.business_id);
 if not (b.customer_id=auth.uid() or caller_business or public.is_admin()) then raise exception 'Not authorized'; end if;
 if public.is_admin() then allowed:=true;
 elsif caller_business then allowed:=(b.status,p_next) in (('REQUESTED','PENDING_PAYMENT'),('REQUESTED','CONFIRMED'),('PENDING_PAYMENT','CONFIRMED'),('CONFIRMED','UPCOMING'),('UPCOMING','IN_PROGRESS'),('IN_PROGRESS','COMPLETED'),('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED'));
 else allowed:=(b.status,p_next) in (('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED'));
 end if;
 if not allowed then raise exception 'Invalid booking transition'; end if;
 update public.bookings set status=p_next,completed_at=case when p_next='COMPLETED' then now() else completed_at end,updated_at=now() where id=p_booking_id;
 return true;
end; $$;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;

create or replace function public.adjust_inventory(p_product_id uuid,p_delta integer) returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid; current_stock integer; reserved integer;
begin
 select business_id into bid from public.products where id=p_product_id;
 if bid is null then raise exception 'Product not found'; end if;
 if not (public.is_business_member(bid) or public.is_admin()) then raise exception 'Not authorized'; end if;
 if p_delta=0 then return true; end if;
 select stock_quantity,reserved_quantity into current_stock,reserved from public.inventory where product_id=p_product_id for update;
 if current_stock is null then insert into public.inventory(product_id,stock_quantity) values(p_product_id,greatest(0,p_delta)); return true; end if;
 if current_stock+p_delta<reserved then raise exception 'Stock cannot fall below reserved quantity'; end if;
 if current_stock+p_delta<0 then raise exception 'Inventory cannot become negative'; end if;
 update public.inventory set stock_quantity=current_stock+p_delta,updated_at=now() where product_id=p_product_id;
 update public.products set status=case when current_stock+p_delta-reserved<=0 then 'OUT_OF_STOCK' else case when status='OUT_OF_STOCK' then 'ACTIVE' else status end end,updated_at=now() where id=p_product_id;
 return true;
end; $$;
grant execute on function public.adjust_inventory(uuid,integer) to authenticated;

create or replace function public.update_order_status(p_order_id uuid,p_next public.order_status) returns boolean language plpgsql security definer set search_path=public as $$
declare o public.orders; allowed boolean:=false;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if not (public.is_business_member(o.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
 if public.is_admin() then allowed:=true;
 else allowed:=(o.status,p_next) in (('PAYMENT_CONFIRMED','ACCEPTED'),('ACCEPTED','PREPARING'),('PREPARING','READY_FOR_PICKUP'),('READY_FOR_PICKUP','OUT_FOR_DELIVERY'),('PAYMENT_CONFIRMED','CANCELLED'),('ACCEPTED','CANCELLED'),('PREPARING','CANCELLED'),('READY_FOR_PICKUP','CANCELLED'));
 end if;
 if not allowed then raise exception 'Invalid order transition'; end if;
 update public.orders set status=p_next,updated_at=now() where id=p_order_id;
 return true;
end; $$;
grant execute on function public.update_order_status(uuid,public.order_status) to authenticated;
