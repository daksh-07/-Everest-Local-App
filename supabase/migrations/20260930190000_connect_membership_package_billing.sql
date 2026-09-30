-- Business memberships and prepaid service packages are business revenue.
-- Charge them directly on the connected business account and retain Everest's
-- service commission through Connect application fees.

alter table public.customer_memberships
  add column if not exists stripe_connected_account_id text,
  add column if not exists marketplace_fee_per_period numeric not null default 0
    check(marketplace_fee_per_period>=0),
  add column if not exists stripe_application_fee_percent numeric
    check(stripe_application_fee_percent is null or stripe_application_fee_percent between 0 and 100),
  add column if not exists fee_policy_version text not null default '2026-09-v2';

alter table public.customer_packages
  add column if not exists stripe_connected_account_id text,
  add column if not exists marketplace_fee numeric not null default 0
    check(marketplace_fee>=0),
  add column if not exists provider_net numeric not null default 0
    check(provider_net>=0),
  add column if not exists fee_policy_version text not null default '2026-09-v2';

alter table public.membership_billing_history
  add column if not exists stripe_connected_account_id text,
  add column if not exists marketplace_fee numeric not null default 0
    check(marketplace_fee>=0),
  add column if not exists provider_net numeric not null default 0
    check(provider_net>=0),
  add column if not exists fee_policy_version text not null default '2026-09-v2';


create or replace function public.enforce_paid_growth_offer_readiness()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare bid uuid;
declare active_value boolean;
declare price_value numeric;
begin
  if tg_table_name='business_membership_plans' then
    bid:=new.business_id;active_value:=new.active;price_value:=new.price;
  elsif tg_table_name='business_packages' then
    bid:=new.business_id;active_value:=new.active;price_value:=new.price;
  else
    raise exception 'Unsupported paid growth table';
  end if;

  if active_value and coalesce(price_value,0)>0
     and not public.is_business_payment_ready(bid) then
    raise exception 'Set up Stripe payouts before activating paid memberships or packages';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_paid_growth_offer_readiness()
from public,anon,authenticated;

drop trigger if exists trg_paid_growth_offer_readiness on public.business_membership_plans;
create trigger trg_paid_growth_offer_readiness
before insert or update of active,price,business_id
on public.business_membership_plans
for each row execute function public.enforce_paid_growth_offer_readiness();

drop trigger if exists trg_paid_growth_offer_readiness on public.business_packages;
create trigger trg_paid_growth_offer_readiness
before insert or update of active,price,business_id
on public.business_packages
for each row execute function public.enforce_paid_growth_offer_readiness();


create or replace function public.prepare_membership_checkout(
  p_membership_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.customer_memberships;
  b public.businesses;
  fee_amount numeric;
  fee_percent numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 16 and 128 then
    raise exception 'Invalid idempotency key';
  end if;

  select * into m
  from public.customer_memberships
  where id=p_membership_id and customer_id=auth.uid()
  for update;

  if m.id is null then raise exception 'Membership invitation not found'; end if;
  if m.status in ('ACTIVE','TRIALING','CANCEL_AT_PERIOD_END','PAUSED','PAST_DUE') then
    raise exception 'Membership is already connected to billing';
  end if;
  if m.status='CANCELED' then raise exception 'Membership invitation is canceled'; end if;

  select * into b
  from public.businesses
  where id=m.business_id
    and status='ACTIVE'
    and verification_status='VERIFIED'
  for update;

  if b.id is null then raise exception 'Business is not available for membership billing'; end if;
  if not public.is_business_payment_ready(b.id) then
    raise exception 'This business is not ready to receive Everest payments';
  end if;

  fee_amount:=public.calculate_service_platform_fee(m.price);
  fee_percent:=case
    when coalesce(m.price,0)<=0 then 0
    else round((fee_amount/m.price)*100,2)
  end;

  update public.customer_memberships
  set status=case when status='INVITED' then 'INCOMPLETE' else status end,
      stripe_connected_account_id=b.stripe_connected_account_id,
      marketplace_fee_per_period=fee_amount,
      stripe_application_fee_percent=fee_percent,
      fee_policy_version='2026-09-v2',
      updated_at=now()
  where id=m.id
  returning * into m;

  return jsonb_build_object(
    'membership_id',m.id,
    'business_id',m.business_id,
    'customer_id',m.customer_id,
    'title',m.title,
    'price',m.price,
    'currency',m.currency,
    'interval_unit',m.billing_interval_unit,
    'interval_count',m.billing_interval_count,
    'start_date',m.start_date,
    'checkout_session_id',m.stripe_checkout_session_id,
    'idempotency_key',p_idempotency_key,
    'connected_account_id',m.stripe_connected_account_id,
    'marketplace_fee_per_period',m.marketplace_fee_per_period,
    'application_fee_percent',m.stripe_application_fee_percent,
    'fee_policy_version',m.fee_policy_version
  );
end
$$;


create or replace function public.prepare_package_checkout(
  p_package_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.business_packages;
  cp public.customer_packages;
  b public.businesses;
  fee_amount numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 16 and 128 then
    raise exception 'Invalid idempotency key';
  end if;

  select * into cp
  from public.customer_packages
  where purchase_idempotency_key=p_idempotency_key
  for update;

  if cp.id is not null then
    if cp.customer_id<>auth.uid() then raise exception 'Idempotency key belongs to another customer'; end if;
    return jsonb_build_object(
      'customer_package_id',cp.id,
      'package_id',cp.package_id,
      'business_id',cp.business_id,
      'customer_id',cp.customer_id,
      'price',cp.purchase_price,
      'currency',cp.currency,
      'credits',cp.purchased_credits,
      'checkout_session_id',cp.stripe_checkout_session_id,
      'connected_account_id',cp.stripe_connected_account_id,
      'marketplace_fee',cp.marketplace_fee,
      'provider_net',cp.provider_net,
      'fee_policy_version',cp.fee_policy_version,
      'reused',true
    );
  end if;

  select * into p
  from public.business_packages
  where id=p_package_id and active and visibility='PUBLIC';

  if p.id is null then raise exception 'Package is not available'; end if;

  select * into b
  from public.businesses
  where id=p.business_id
    and status='ACTIVE'
    and verification_status='VERIFIED'
  for update;

  if b.id is null then raise exception 'Business is not available'; end if;
  if not public.is_business_payment_ready(b.id) then
    raise exception 'This business is not ready to receive Everest payments';
  end if;

  fee_amount:=public.calculate_service_platform_fee(p.price);

  insert into public.customer_packages(
    business_id,package_id,customer_id,purchase_price,currency,purchased_credits,
    purchase_idempotency_key,stripe_connected_account_id,marketplace_fee,provider_net,
    fee_policy_version
  )
  values(
    p.business_id,p.id,auth.uid(),p.price,p.currency,p.credit_count,
    p_idempotency_key,b.stripe_connected_account_id,fee_amount,
    round(greatest(p.price-fee_amount,0),2),'2026-09-v2'
  )
  returning * into cp;

  return jsonb_build_object(
    'customer_package_id',cp.id,
    'package_id',p.id,
    'business_id',p.business_id,
    'customer_id',auth.uid(),
    'name',p.name,
    'price',p.price,
    'currency',p.currency,
    'credits',p.credit_count,
    'checkout_session_id',null,
    'connected_account_id',cp.stripe_connected_account_id,
    'marketplace_fee',cp.marketplace_fee,
    'provider_net',cp.provider_net,
    'fee_policy_version',cp.fee_policy_version,
    'reused',false
  );
end
$$;


create or replace function public.record_membership_invoice(
  p_membership_id uuid,
  p_invoice_id text,
  p_payment_intent_id text,
  p_amount numeric,
  p_currency text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.customer_memberships;
  grant_key text;
  paid_amount numeric;
  fee_amount numeric;
  net_amount numeric;
begin
  if p_status not in ('PAID','FAILED','REFUNDED','VOID') then
    raise exception 'Invalid invoice status';
  end if;

  select * into m
  from public.customer_memberships
  where id=p_membership_id
  for update;

  if m.id is null then raise exception 'Membership not found'; end if;

  paid_amount:=round(greatest(coalesce(p_amount,0),0),2);
  fee_amount:=case
    when p_status='PAID' then round(paid_amount*coalesce(m.stripe_application_fee_percent,0)/100,2)
    else 0
  end;
  net_amount:=case
    when p_status='PAID' then round(greatest(paid_amount-fee_amount,0),2)
    else 0
  end;

  insert into public.membership_billing_history(
    membership_id,business_id,customer_id,stripe_invoice_id,stripe_payment_intent_id,
    amount,currency,status,period_start,period_end,stripe_event_id,
    stripe_connected_account_id,marketplace_fee,provider_net,fee_policy_version
  )
  values(
    m.id,m.business_id,m.customer_id,p_invoice_id,p_payment_intent_id,
    paid_amount,lower(coalesce(p_currency,'aud')),p_status,p_period_start,p_period_end,p_event_id,
    m.stripe_connected_account_id,fee_amount,net_amount,m.fee_policy_version
  )
  on conflict(stripe_invoice_id) do update set
    stripe_payment_intent_id=coalesce(
      excluded.stripe_payment_intent_id,
      public.membership_billing_history.stripe_payment_intent_id
    ),
    amount=excluded.amount,
    status=excluded.status,
    period_start=excluded.period_start,
    period_end=excluded.period_end,
    stripe_event_id=excluded.stripe_event_id,
    stripe_connected_account_id=excluded.stripe_connected_account_id,
    marketplace_fee=excluded.marketplace_fee,
    provider_net=excluded.provider_net,
    fee_policy_version=excluded.fee_policy_version,
    occurred_at=now();

  if p_status='PAID' and m.included_credits_per_period>0 then
    grant_key:='membership_invoice:'||p_invoice_id;
    insert into public.service_credit_ledger(
      business_id,customer_id,membership_id,delta,reason,source_type,source_id,source_key
    )
    values(
      m.business_id,m.customer_id,m.id,m.included_credits_per_period,
      'Membership period credits','MEMBERSHIP_INVOICE',p_invoice_id,grant_key
    )
    on conflict(source_key) do nothing;
  end if;

  if p_status='FAILED' then
    update public.customer_memberships
    set status='PAST_DUE'
    where id=m.id and status not in ('CANCELED','PAUSED');

    insert into public.notifications(user_id,kind,title,body,data)
    values(
      m.customer_id,'MEMBERSHIP_PAYMENT_FAILED',
      'Membership payment needs attention',
      'A recurring membership payment failed. Update your payment method to keep benefits active.',
      jsonb_build_object('membership_id',m.id,'invoice_id',p_invoice_id)
    )
    on conflict do nothing;
  end if;

  return true;
end
$$;

revoke all on function public.prepare_membership_checkout(uuid,text) from public,anon;
revoke all on function public.prepare_package_checkout(uuid,text) from public,anon;
grant execute on function public.prepare_membership_checkout(uuid,text) to authenticated;
grant execute on function public.prepare_package_checkout(uuid,text) to authenticated;
