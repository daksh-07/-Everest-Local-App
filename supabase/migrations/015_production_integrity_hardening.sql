-- Production integrity hardening.
-- Sensitive marketplace state must only be changed through authorized RPCs / trusted services.

-- Prevent business users from bypassing verification and quote authorization with direct table writes.
revoke insert, update, delete on public.services from anon, authenticated;
revoke insert, update, delete on public.products from anon, authenticated;
revoke insert, update, delete on public.quotes from anon, authenticated;
revoke insert, update, delete on public.opportunities from anon, authenticated;

-- Marketplace notifications are server-generated. Clients may only read their own notifications.
revoke insert, update, delete on public.notifications from anon, authenticated;

-- Product images must follow the same public visibility rule as their product.
drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images
for select using (
  exists (
    select 1
    from public.products p
    join public.businesses b on b.id=p.business_id
    where p.id=product_id
      and p.status in ('ACTIVE','OUT_OF_STOCK')
      and b.status='ACTIVE'
      and b.verification_status='VERIFIED'
  )
  or public.is_business_member((select business_id from public.products where id=product_id))
  or public.is_admin()
);

-- A booking requiring payment must not be confirmed by a customer or business account.
-- Payment confirmation must come from the trusted payment integration.
create or replace function public.update_booking_status(
  p_booking_id uuid,
  p_next public.booking_status
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.bookings;
  allowed boolean:=false;
  caller_business boolean:=false;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null then raise exception 'Booking not found'; end if;
  caller_business:=public.is_business_member(b.business_id);
  if not (b.customer_id=auth.uid() or caller_business or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if public.is_admin() then
    allowed:=true;
  elsif caller_business then
    allowed:=(b.status,p_next) in (
      ('REQUESTED','CONFIRMED'),
      ('CONFIRMED','UPCOMING'),
      ('UPCOMING','IN_PROGRESS'),
      ('IN_PROGRESS','COMPLETED'),
      ('REQUESTED','CANCELLED'),
      ('PENDING_PAYMENT','CANCELLED'),
      ('CONFIRMED','CANCELLED'),
      ('UPCOMING','CANCELLED'),
      ('CONFIRMED','DISPUTED'),
      ('UPCOMING','DISPUTED'),
      ('IN_PROGRESS','DISPUTED')
    );
  else
    allowed:=(b.status,p_next) in (
      ('REQUESTED','CANCELLED'),
      ('PENDING_PAYMENT','CANCELLED'),
      ('CONFIRMED','CANCELLED'),
      ('UPCOMING','CANCELLED'),
      ('CONFIRMED','DISPUTED'),
      ('UPCOMING','DISPUTED'),
      ('IN_PROGRESS','DISPUTED')
    );
  end if;

  if not allowed then raise exception 'Invalid booking transition'; end if;
  update public.bookings
  set status=p_next,
      completed_at=case when p_next='COMPLETED' then now() else completed_at end,
      updated_at=now()
  where id=p_booking_id;
  return true;
end;
$$;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;

-- Hard account deletion is only safe when there are no retained records whose foreign keys
-- intentionally preserve transaction/audit history. Active financial/work records are blocked.
create or replace function public.can_delete_my_account() returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.businesses where owner_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.business_members where user_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.orders where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.bookings where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.service_requests where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.quotes where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.reviews where author_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.messages where sender_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.conversations where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.delivery_assignments where driver_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.payments where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.payouts p join public.businesses b on b.id=p.business_id where b.owner_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.admin_actions where admin_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.audit_logs where actor_id=auth.uid()) then return false; end if;
  return true;
end;
$$;
revoke execute on function public.can_delete_my_account() from anon,authenticated;
