-- Keep hard account deletion consistent with retained marketplace, financial,
-- moderation, support and compliance records.

create or replace function public.can_delete_my_account()
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.is_admin_identity() then return false; end if;

  -- Business / workforce / compliance identity.
  if exists(select 1 from public.businesses where owner_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.business_members where user_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.driver_applications where user_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.delivery_assignments where driver_id=auth.uid()) then return false; end if;

  -- Marketplace / financial / subscription records.
  if exists(select 1 from public.orders where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.bookings where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.service_requests where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.quotes where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.payments where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.service_payments where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.customer_memberships where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.customer_packages where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.membership_billing_history where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.service_credit_ledger where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.post_promotions where purchaser_id=auth.uid()) then return false; end if;
  if exists(
    select 1 from public.payouts p
    join public.businesses b on b.id=p.business_id
    where b.owner_id=auth.uid()
  ) then return false; end if;

  -- Messaging, moderation, dispute and anti-circumvention evidence.
  if exists(select 1 from public.reviews where author_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.messages where sender_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.conversations where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.personal_messages where sender_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.personal_message_edit_history where editor_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.payment_circumvention_flags where sender_id=auth.uid()) then return false; end if;
  if exists(
    select 1 from public.user_reports
    where reporter_id=auth.uid() or reported_user_id=auth.uid()
  ) then return false; end if;
  if exists(select 1 from public.post_reports where reporter_id=auth.uid()) then return false; end if;
  if exists(
    select 1
    from public.post_reports pr
    join public.posts p on p.id=pr.post_id
    where p.author_id=auth.uid()
  ) then return false; end if;

  -- Support / external-contact records whose FK retention would otherwise make
  -- the final Auth deletion fail after the preflight returned true.
  if exists(select 1 from public.support_requests where user_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.external_business_claim_requests where requested_by=auth.uid()) then return false; end if;
  if exists(select 1 from public.external_enquiries where customer_id=auth.uid()) then return false; end if;

  -- Security / audit evidence.
  if exists(select 1 from public.admin_actions where admin_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.audit_logs where actor_id=auth.uid()) then return false; end if;

  return true;
end
$$;

revoke all on function public.can_delete_my_account() from public,anon;
grant execute on function public.can_delete_my_account() to authenticated;
