-- Apple App Store subscription support for Everest Pro.
-- Stripe remains supported for web; Apple StoreKit is the billing source for iOS purchases.

alter table public.business_subscriptions
  add column if not exists billing_provider text not null default 'STRIPE',
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_transaction_id text,
  add column if not exists apple_product_id text,
  add column if not exists apple_environment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='business_subscriptions_billing_provider_check'
      and conrelid='public.business_subscriptions'::regclass
  ) then
    alter table public.business_subscriptions
      add constraint business_subscriptions_billing_provider_check
      check (billing_provider in ('STRIPE','APPLE'));
  end if;
end $$;

create unique index if not exists business_subscriptions_apple_original_tx_uidx
  on public.business_subscriptions(apple_original_transaction_id)
  where apple_original_transaction_id is not null;

create index if not exists business_subscriptions_provider_status_idx
  on public.business_subscriptions(billing_provider,status);
