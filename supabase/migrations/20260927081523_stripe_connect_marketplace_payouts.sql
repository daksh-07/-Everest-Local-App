-- Stripe Connect marketplace payout readiness.
-- Cost model: direct charges on connected accounts, Stripe collects processing fees,
-- Everest collects only its application/platform fee.
-- Bank details remain with Stripe; Everest stores only connected-account readiness metadata.

alter table public.businesses
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_bank_connected boolean not null default false,
  add column if not exists stripe_requirements_due jsonb not null default '[]'::jsonb,
  add column if not exists stripe_connect_synced_at timestamptz,
  add column if not exists stripe_connect_fee_payer text not null default 'ACCOUNT'
    check (stripe_connect_fee_payer in ('ACCOUNT','PLATFORM'));

alter table public.payments
  add column if not exists stripe_connected_account_id text,
  add column if not exists stripe_charge_model text not null default 'DIRECT'
    check (stripe_charge_model in ('DIRECT','PLATFORM')),
  add column if not exists stripe_application_fee numeric not null default 0
    check (stripe_application_fee >= 0);

alter table public.service_payments
  add column if not exists stripe_connected_account_id text,
  add column if not exists stripe_charge_model text not null default 'DIRECT'
    check (stripe_charge_model in ('DIRECT','PLATFORM')),
  add column if not exists stripe_application_fee numeric not null default 0
    check (stripe_application_fee >= 0);

alter table public.marketplace_payout_ledger
  add column if not exists charge_model text not null default 'DIRECT'
    check (charge_model in ('DIRECT','PLATFORM_TRANSFER')),
  add column if not exists fee_payer text not null default 'CONNECTED_ACCOUNT'
    check (fee_payer in ('CONNECTED_ACCOUNT','PLATFORM')),
  add column if not exists stripe_application_fee numeric not null default 0
    check (stripe_application_fee >= 0);

alter table public.marketplace_payout_ledger
  drop constraint if exists marketplace_payout_ledger_status_check;
alter table public.marketplace_payout_ledger
  add constraint marketplace_payout_ledger_status_check
  check (status in ('HELD','READY','TRANSFERRED','DIRECT_SETTLED','REVERSED','FAILED'));

create or replace function public.is_business_payment_ready(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.businesses b
    where b.id=p_business_id
      and b.status='ACTIVE'
      and b.verification_status='VERIFIED'
      and b.stripe_connect_status='ACTIVE'
      and b.stripe_details_submitted
      and b.stripe_charges_enabled
      and b.stripe_payouts_enabled
      and b.stripe_connected_account_id is not null
  )
$$;

revoke all on function public.is_business_payment_ready(uuid) from public,anon;
grant execute on function public.is_business_payment_ready(uuid) to authenticated;

-- A business can build drafts before payout onboarding, but nothing paid can go live
-- until Stripe confirms the business can both accept charges and receive payouts.
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
  if bid is null or not public.is_business_member(bid) or not coalesce(verified,false) then
    raise exception 'Verified business access is required';
  end if;
  if p_active and not public.is_business_payment_ready(bid) then
    raise exception 'Set up Stripe payouts before activating paid services';
  end if;
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
 if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
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

-- Existing paid listings must not remain purchasable after this migration until payout setup completes.
update public.services s
set active=false,updated_at=now()
where s.active
  and not public.is_business_payment_ready(s.business_id);

update public.products p
set status='PAUSED',updated_at=now()
where p.status='ACTIVE'
  and not public.is_business_payment_ready(p.business_id);

-- Keep the payout ledger truthful for direct charges. No Stripe Transfer is required:
-- the charge is created on the connected account and Everest receives an application fee.
update public.marketplace_payout_ledger
set charge_model='DIRECT',
    fee_payer='CONNECTED_ACCOUNT',
    stripe_application_fee=marketplace_fee
where charge_model is distinct from 'DIRECT'
   or fee_payer is distinct from 'CONNECTED_ACCOUNT'
   or stripe_application_fee is distinct from marketplace_fee;

notify pgrst,'reload schema';
