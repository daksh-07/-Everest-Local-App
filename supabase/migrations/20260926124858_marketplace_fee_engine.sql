-- Marketplace fee engine v1.
-- Services: $5 minimum; 5% first $500; 3.5% $500-$1000; 2.8% above $1000.
-- Products: 5% of product subtotal. Delivery is excluded from the product platform fee.

create or replace function public.calculate_service_platform_fee(p_amount numeric)
returns numeric language sql immutable set search_path='' as $$
  select case
    when coalesce(p_amount,0)<=0 then 0::numeric
    else round(
      least(
        p_amount,
        greatest(
          5::numeric,
          least(p_amount,500::numeric)*0.05
          + greatest(least(p_amount,1000::numeric)-500::numeric,0::numeric)*0.035
          + greatest(p_amount-1000::numeric,0::numeric)*0.028
        )
      ),
      2
    )
  end
$$;

create or replace function public.calculate_product_platform_fee(p_subtotal numeric)
returns numeric language sql immutable set search_path='' as $$
  select case when coalesce(p_subtotal,0)<=0 then 0::numeric else round(p_subtotal*0.05,2) end
$$;

alter table public.service_payments
  add column if not exists marketplace_fee numeric not null default 0,
  add column if not exists provider_net numeric not null default 0,
  add column if not exists fee_policy_version text not null default '2026-09-v1';

alter table public.orders
  add column if not exists provider_net numeric not null default 0,
  add column if not exists fee_policy_version text not null default '2026-09-v1';

alter table public.businesses
  add column if not exists stripe_connected_account_id text,
  add column if not exists stripe_connect_status text not null default 'NOT_CONNECTED'
    check (stripe_connect_status in ('NOT_CONNECTED','PENDING','RESTRICTED','ACTIVE','DISABLED'));

create unique index if not exists businesses_stripe_connected_account_uidx
  on public.businesses(stripe_connected_account_id)
  where stripe_connected_account_id is not null;

create or replace function public.apply_service_payment_fee()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.marketplace_fee:=public.calculate_service_platform_fee(new.amount);
  new.provider_net:=round(greatest(new.amount-new.marketplace_fee,0),2);
  new.fee_policy_version:='2026-09-v1';
  return new;
end $$;

drop trigger if exists trg_apply_service_payment_fee on public.service_payments;
create trigger trg_apply_service_payment_fee
before insert or update of amount on public.service_payments
for each row execute function public.apply_service_payment_fee();

create or replace function public.apply_product_order_fee()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.marketplace_fee:=public.calculate_product_platform_fee(new.subtotal);
  new.provider_net:=round(greatest(new.subtotal-new.marketplace_fee,0),2);
  new.fee_policy_version:='2026-09-v1';
  return new;
end $$;

drop trigger if exists trg_apply_product_order_fee on public.orders;
create trigger trg_apply_product_order_fee
before insert or update of subtotal on public.orders
for each row execute function public.apply_product_order_fee();

update public.service_payments
set marketplace_fee=public.calculate_service_platform_fee(amount),
    provider_net=round(greatest(amount-public.calculate_service_platform_fee(amount),0),2),
    fee_policy_version='2026-09-v1';

update public.orders
set marketplace_fee=public.calculate_product_platform_fee(subtotal),
    provider_net=round(greatest(subtotal-public.calculate_product_platform_fee(subtotal),0),2),
    fee_policy_version='2026-09-v1';

create table if not exists public.marketplace_payout_ledger (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('SERVICE_PAYMENT','PRODUCT_ORDER')),
  source_id uuid not null,
  business_id uuid not null references public.businesses(id) on delete restrict,
  fee_base_amount numeric not null check (fee_base_amount>=0),
  marketplace_fee numeric not null check (marketplace_fee>=0),
  provider_net numeric not null check (provider_net>=0),
  currency text not null default 'aud',
  status text not null default 'HELD' check (status in ('HELD','READY','TRANSFERRED','REVERSED','FAILED')),
  stripe_connected_account_id text,
  stripe_transfer_id text,
  fee_policy_version text not null default '2026-09-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_id)
);

create index if not exists marketplace_payout_ledger_business_idx
  on public.marketplace_payout_ledger(business_id,created_at desc);
create index if not exists marketplace_payout_ledger_status_idx
  on public.marketplace_payout_ledger(status,created_at);

alter table public.marketplace_payout_ledger enable row level security;

drop policy if exists marketplace_payout_ledger_business_read on public.marketplace_payout_ledger;
create policy marketplace_payout_ledger_business_read
on public.marketplace_payout_ledger for select to authenticated
using (public.is_business_member(business_id) or public.is_admin());

revoke insert,update,delete on public.marketplace_payout_ledger from anon,authenticated;
grant select on public.marketplace_payout_ledger to authenticated;

create or replace function public.record_service_payout_ledger()
returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid; connected_id text;
begin
  if new.status='SUCCEEDED' and old.status is distinct from 'SUCCEEDED' then
    select b.business_id,biz.stripe_connected_account_id into bid,connected_id
    from public.bookings b join public.businesses biz on biz.id=b.business_id
    where b.id=new.booking_id;
    if bid is not null then
      insert into public.marketplace_payout_ledger(
        source_type,source_id,business_id,fee_base_amount,marketplace_fee,provider_net,currency,status,
        stripe_connected_account_id,fee_policy_version
      ) values(
        'SERVICE_PAYMENT',new.id,bid,new.amount,new.marketplace_fee,new.provider_net,new.currency,'HELD',
        connected_id,new.fee_policy_version
      ) on conflict(source_type,source_id) do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_record_service_payout_ledger on public.service_payments;
create trigger trg_record_service_payout_ledger
after update of status on public.service_payments
for each row execute function public.record_service_payout_ledger();

create or replace function public.record_product_payout_ledger()
returns trigger language plpgsql security definer set search_path='' as $$
declare connected_id text;
begin
  if new.payment_status='SUCCEEDED' and old.payment_status is distinct from 'SUCCEEDED' then
    select stripe_connected_account_id into connected_id from public.businesses where id=new.business_id;
    insert into public.marketplace_payout_ledger(
      source_type,source_id,business_id,fee_base_amount,marketplace_fee,provider_net,currency,status,
      stripe_connected_account_id,fee_policy_version
    ) values(
      'PRODUCT_ORDER',new.id,new.business_id,new.subtotal,new.marketplace_fee,new.provider_net,'aud','HELD',
      connected_id,new.fee_policy_version
    ) on conflict(source_type,source_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_record_product_payout_ledger on public.orders;
create trigger trg_record_product_payout_ledger
after update of payment_status on public.orders
for each row execute function public.record_product_payout_ledger();

revoke all on function public.apply_service_payment_fee() from public,anon,authenticated;
revoke all on function public.apply_product_order_fee() from public,anon,authenticated;
revoke all on function public.record_service_payout_ledger() from public,anon,authenticated;
revoke all on function public.record_product_payout_ledger() from public,anon,authenticated;

grant execute on function public.calculate_service_platform_fee(numeric) to anon,authenticated;
grant execute on function public.calculate_product_platform_fee(numeric) to anon,authenticated;
