create or replace function public.get_or_create_conversation(
 p_request_id uuid,p_business_id uuid,p_quote_id uuid default null,p_booking_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_customer uuid; v_conversation uuid; v_lock_key bigint;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_request_id is null or p_business_id is null then raise exception 'Request and business are required'; end if;
 select customer_id into v_customer from public.service_requests where id=p_request_id;
 if v_customer is null then raise exception 'Request not found'; end if;
 if not (
   v_user=v_customer or public.is_admin() or public.has_business_permission(p_business_id,'INBOX_VIEW_ALL')
   or (p_booking_id is not null and public.can_operate_business_booking(p_booking_id))
 ) then raise exception 'Not authorized for this conversation'; end if;
 if not exists(select 1 from public.opportunities o where o.request_id=p_request_id and o.business_id=p_business_id)
   and not exists(select 1 from public.quotes q where q.request_id=p_request_id and q.business_id=p_business_id)
   and not exists(select 1 from public.bookings b where b.request_id=p_request_id and b.business_id=p_business_id)
 then raise exception 'Business is not associated with this request'; end if;
 if p_quote_id is not null and not exists(
   select 1 from public.quotes q where q.id=p_quote_id and q.request_id=p_request_id and q.business_id=p_business_id and q.customer_id=v_customer
 ) then raise exception 'Quote does not belong to this conversation'; end if;
 if p_booking_id is not null and not exists(
   select 1 from public.bookings b where b.id=p_booking_id and b.request_id=p_request_id and b.business_id=p_business_id and b.customer_id=v_customer
 ) then raise exception 'Booking does not belong to this conversation'; end if;
 v_lock_key:=hashtextextended(v_customer::text||':'||p_business_id::text||':'||p_request_id::text,0);
 perform pg_advisory_xact_lock(v_lock_key);
 select id into v_conversation from public.conversations
 where customer_id=v_customer and business_id=p_business_id and request_id=p_request_id
 order by created_at asc,id asc limit 1;
 if v_conversation is null then
   insert into public.conversations(customer_id,business_id,request_id,quote_id,booking_id)
   values(v_customer,p_business_id,p_request_id,p_quote_id,p_booking_id)
   returning id into v_conversation;
 elsif p_booking_id is not null then
   update public.conversations set booking_id=coalesce(booking_id,p_booking_id) where id=v_conversation;
 end if;
 return v_conversation;
end
$$;
revoke all on function public.get_or_create_conversation(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.get_or_create_conversation(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.mark_message_read(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update public.messages m set read_at=coalesce(m.read_at,now())
 from public.conversations c
 where m.id=p_message_id and m.conversation_id=c.id
   and public.can_access_business_conversation(c.id)
   and m.sender_id<>auth.uid();
 return found;
end
$$;
revoke all on function public.mark_message_read(uuid) from public,anon;
grant execute on function public.mark_message_read(uuid) to authenticated;

create or replace function public.adjust_inventory(p_product_id uuid,p_delta integer)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare bid uuid; current_stock integer; reserved integer;
begin
 select business_id into bid from public.products where id=p_product_id;
 if bid is null then raise exception 'Product not found'; end if;
 if not (public.has_business_permission(bid,'CATALOG_MANAGE') or public.is_admin()) then raise exception 'Not authorized'; end if;
 if p_delta=0 then return true; end if;
 select stock_quantity,reserved_quantity into current_stock,reserved from public.inventory where product_id=p_product_id for update;
 if current_stock is null then insert into public.inventory(product_id,stock_quantity) values(p_product_id,greatest(0,p_delta)); return true; end if;
 if current_stock+p_delta<reserved then raise exception 'Stock cannot fall below reserved quantity'; end if;
 if current_stock+p_delta<0 then raise exception 'Inventory cannot become negative'; end if;
 update public.inventory set stock_quantity=current_stock+p_delta,updated_at=now() where product_id=p_product_id;
 update public.products set status=case when current_stock+p_delta-reserved<=0 then 'OUT_OF_STOCK' else case when status='OUT_OF_STOCK' then 'ACTIVE' else status end end,updated_at=now() where id=p_product_id;
 return true;
end
$$;
revoke all on function public.adjust_inventory(uuid,integer) from public,anon;
grant execute on function public.adjust_inventory(uuid,integer) to authenticated;

create or replace function public.update_order_status(p_order_id uuid,p_next public.order_status)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare o public.orders; allowed boolean:=false;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if not (public.has_business_permission(o.business_id,'ORDERS_MANAGE') or public.is_admin()) then raise exception 'Not authorized'; end if;
 if public.is_admin() then allowed:=true;
 else allowed:=(o.status,p_next) in (
   ('PAYMENT_CONFIRMED','ACCEPTED'),('ACCEPTED','PREPARING'),('PREPARING','READY_FOR_PICKUP'),
   ('READY_FOR_PICKUP','OUT_FOR_DELIVERY'),('PAYMENT_CONFIRMED','CANCELLED'),('ACCEPTED','CANCELLED'),
   ('PREPARING','CANCELLED'),('READY_FOR_PICKUP','CANCELLED')
 );
 end if;
 if not allowed then raise exception 'Invalid order transition'; end if;
 update public.orders set status=p_next,updated_at=now() where id=p_order_id;
 return true;
end
$$;
revoke all on function public.update_order_status(uuid,public.order_status) from public,anon;
grant execute on function public.update_order_status(uuid,public.order_status) to authenticated;

-- Paid catalogue activation must require catalogue management, even though the functions are security definer.
create or replace function public.set_service_status(p_service_id uuid,p_active boolean)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare bid uuid; verified boolean;
begin
 select business_id into bid from public.services where id=p_service_id;
 select verification_status='VERIFIED' into verified from public.businesses where id=bid;
 if bid is null or not (public.has_business_permission(bid,'CATALOG_MANAGE') or public.is_admin()) or not coalesce(verified,false) then
   raise exception 'Verified catalogue management access is required';
 end if;
 if p_active and not public.is_business_payment_ready(bid) then raise exception 'Set up Stripe payouts before activating paid services'; end if;
 update public.services set active=p_active,updated_at=now() where id=p_service_id;
 return found;
end
$$;
revoke all on function public.set_service_status(uuid,boolean) from public,anon;
grant execute on function public.set_service_status(uuid,boolean) to authenticated;

create or replace function public.set_product_status(p_product_id uuid,p_status public.product_status)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare bid uuid; verified boolean; has_photo boolean; p record; has_stock boolean;
begin
 select * into p from public.products where id=p_product_id for update;
 bid:=p.business_id;
 if bid is null or auth.uid() is null or not (public.has_business_permission(bid,'CATALOG_MANAGE') or public.is_admin()) then raise exception 'Not authorized'; end if;
 if p_status='ACTIVE' then
  select verification_status='VERIFIED' into verified from public.businesses where id=bid and status='ACTIVE';
  select exists(select 1 from public.product_images where product_id=p_product_id) into has_photo;
  if not coalesce(verified,false) then raise exception 'Business verification is required before publishing products'; end if;
  if not public.is_business_payment_ready(bid) then raise exception 'Set up Stripe payouts before publishing paid products'; end if;
  if not has_photo then raise exception 'Add at least one product photo before publishing'; end if;
  if p.category_id is null or length(trim(coalesce(p.description,'')))<10 then raise exception 'Category and description are required before publishing'; end if;
  if not(p.pickup_available or p.delivery_eligible or p.shipping_available) then raise exception 'Choose at least one fulfilment method'; end if;
  if exists(select 1 from public.product_variants where product_id=p_product_id) then
    select exists(select 1 from public.product_variants where product_id=p_product_id and available and (not p.track_stock or stock_quantity-reserved_quantity>0 or p.made_to_order)) into has_stock;
  else
    select (not p.track_stock or p.made_to_order or exists(select 1 from public.inventory where product_id=p_product_id and stock_quantity-reserved_quantity>0)) into has_stock;
  end if;
  if not coalesce(has_stock,false) then raise exception 'Product has no available stock'; end if;
 end if;
 update public.products set status=p_status,published_at=case when p_status='ACTIVE' then coalesce(published_at,now()) else published_at end,
  listing_quality=coalesce(public.product_listing_quality(p_product_id),0),updated_at=now() where id=p_product_id;
 return found;
end
$$;
revoke all on function public.set_product_status(uuid,public.product_status) from public,anon;
grant execute on function public.set_product_status(uuid,public.product_status) to authenticated;

-- ---------- EVEREST LIVE -> STAFF ASSIGNMENT BRIDGE ----------

create or replace function private.sync_service_dispatch_business_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_business_id uuid; v_status text;
begin
 select spp.business_id into v_business_id
 from public.service_provider_profiles spp
 where spp.provider_id=new.provider_id;
 if v_business_id is null then return new; end if;
 if not exists(
   select 1 from public.business_members bm
   where bm.business_id=v_business_id and bm.user_id=new.provider_id and bm.status='ACTIVE'
 ) then return new; end if;

 v_status:=case
   when new.completed_at is not null then 'COMPLETED'
   when new.started_at is not null then 'IN_PROGRESS'
   else 'ACCEPTED'
 end;

 if exists(
   select 1 from public.business_job_assignments a
   where a.booking_id=new.booking_id and a.status not in ('DECLINED','CANCELLED')
 ) then
   update public.business_job_assignments
   set assigned_user_id=new.provider_id,team_id=null,status=v_status,
       accepted_at=coalesce(accepted_at,new.created_at,now()),
       started_at=coalesce(started_at,new.started_at),
       completed_at=coalesce(completed_at,new.completed_at),
       updated_at=now()
   where booking_id=new.booking_id and status not in ('DECLINED','CANCELLED');
 else
   insert into public.business_job_assignments(
     business_id,booking_id,assigned_user_id,status,accepted_at,started_at,completed_at
   ) values(
     v_business_id,new.booking_id,new.provider_id,v_status,coalesce(new.created_at,now()),new.started_at,new.completed_at
   );
 end if;
 return new;
end
$$;
revoke all on function private.sync_service_dispatch_business_assignment() from public,anon,authenticated;

drop trigger if exists service_dispatch_business_assignment_sync on public.service_dispatch_assignments;
create trigger service_dispatch_business_assignment_sync
after insert or update of provider_id,started_at,completed_at on public.service_dispatch_assignments
for each row execute function private.sync_service_dispatch_business_assignment();

insert into public.business_job_assignments(
  business_id,booking_id,assigned_user_id,status,accepted_at,started_at,completed_at
)
select spp.business_id,sda.booking_id,sda.provider_id,
       case when sda.completed_at is not null then 'COMPLETED' when sda.started_at is not null then 'IN_PROGRESS' else 'ACCEPTED' end,
       coalesce(sda.created_at,now()),sda.started_at,sda.completed_at
from public.service_dispatch_assignments sda
join public.service_provider_profiles spp on spp.provider_id=sda.provider_id
join public.business_members bm on bm.business_id=spp.business_id and bm.user_id=sda.provider_id and bm.status='ACTIVE'
where not exists(select 1 from public.business_job_assignments a where a.booking_id=sda.booking_id and a.status not in ('DECLINED','CANCELLED'))
on conflict do nothing;

-- ---------- COMMENTS / API REFRESH ----------

comment on table public.business_job_assignments is 'Operational assignee for marketplace or CRM jobs. Commercial booking records remain authoritative.';
comment on table public.business_member_permission_overrides is 'Owner-controlled per-member permission overrides layered on top of server-side role defaults.';
comment on function public.has_business_permission(uuid,text) is 'Authoritative business RBAC check. Client UI capability flags are convenience only, never authorization.';

notify pgrst,'reload schema';
