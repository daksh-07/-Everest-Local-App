-- Marketplace payout ledger release states.

create or replace function public.update_service_payout_release_state()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='COMPLETED' and old.status is distinct from 'COMPLETED' then
    update public.marketplace_payout_ledger l
    set status='READY',updated_at=now()
    from public.service_payments sp
    where l.source_type='SERVICE_PAYMENT'
      and l.source_id=sp.id
      and sp.booking_id=new.id
      and sp.status='SUCCEEDED'
      and l.status='HELD';
  end if;
  return new;
end $$;

drop trigger if exists trg_update_service_payout_release_state on public.bookings;
create trigger trg_update_service_payout_release_state
after update of status on public.bookings
for each row execute function public.update_service_payout_release_state();

create or replace function public.update_product_payout_release_state()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='COMPLETED' and old.status is distinct from 'COMPLETED' then
    update public.marketplace_payout_ledger
    set status='READY',updated_at=now()
    where source_type='PRODUCT_ORDER'
      and source_id=new.id
      and status='HELD';
  elsif new.status='REFUNDED' and old.status is distinct from 'REFUNDED' then
    update public.marketplace_payout_ledger
    set status='REVERSED',updated_at=now()
    where source_type='PRODUCT_ORDER'
      and source_id=new.id
      and status in ('HELD','READY');
  end if;
  return new;
end $$;

drop trigger if exists trg_update_product_payout_release_state on public.orders;
create trigger trg_update_product_payout_release_state
after update of status on public.orders
for each row execute function public.update_product_payout_release_state();

revoke all on function public.update_service_payout_release_state() from public,anon,authenticated;
revoke all on function public.update_product_payout_release_state() from public,anon,authenticated;
