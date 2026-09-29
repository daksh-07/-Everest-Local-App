-- Marketplace fee policy v2: flat service fee bands approved for launch.
-- Under $200: 5% with a $5 minimum (capped at the payment amount).
-- $200-$500: 5%. Over $500-$1000: 3.5%. Over $1000: 2.8%.
-- Products remain 5% of product subtotal.

create or replace function public.calculate_service_platform_fee(p_amount numeric)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when coalesce(p_amount,0)<=0 then 0::numeric
    when p_amount<200 then round(least(p_amount,greatest(5::numeric,p_amount*0.05)),2)
    when p_amount<=500 then round(p_amount*0.05,2)
    when p_amount<=1000 then round(p_amount*0.035,2)
    else round(p_amount*0.028,2)
  end
$$;

create or replace function public.apply_service_payment_fee()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.marketplace_fee:=public.calculate_service_platform_fee(new.amount);
  new.provider_net:=round(greatest(new.amount-new.marketplace_fee,0),2);
  new.fee_policy_version:='2026-09-v2';
  return new;
end
$$;

create or replace function public.apply_product_order_fee()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.marketplace_fee:=public.calculate_product_platform_fee(new.subtotal);
  new.provider_net:=round(greatest(new.subtotal-new.marketplace_fee,0),2);
  new.fee_policy_version:='2026-09-v2';
  return new;
end
$$;

alter table public.service_payments alter column fee_policy_version set default '2026-09-v2';
alter table public.orders alter column fee_policy_version set default '2026-09-v2';
alter table public.marketplace_payout_ledger alter column fee_policy_version set default '2026-09-v2';

-- Recalculate any pre-launch rows using the authoritative v2 policy.
update public.service_payments
set marketplace_fee=public.calculate_service_platform_fee(amount),
    provider_net=round(greatest(amount-public.calculate_service_platform_fee(amount),0),2),
    fee_policy_version='2026-09-v2';

update public.orders
set marketplace_fee=public.calculate_product_platform_fee(subtotal),
    provider_net=round(greatest(subtotal-public.calculate_product_platform_fee(subtotal),0),2),
    fee_policy_version='2026-09-v2';

update public.marketplace_payout_ledger l
set marketplace_fee=case
      when l.source_type='SERVICE_PAYMENT' then public.calculate_service_platform_fee(l.fee_base_amount)
      else public.calculate_product_platform_fee(l.fee_base_amount)
    end,
    provider_net=round(greatest(l.fee_base_amount-case
      when l.source_type='SERVICE_PAYMENT' then public.calculate_service_platform_fee(l.fee_base_amount)
      else public.calculate_product_platform_fee(l.fee_base_amount)
    end,0),2),
    fee_policy_version='2026-09-v2';

revoke all on function public.apply_service_payment_fee() from public,anon,authenticated;
revoke all on function public.apply_product_order_fee() from public,anon,authenticated;
grant execute on function public.calculate_service_platform_fee(numeric) to anon,authenticated;
