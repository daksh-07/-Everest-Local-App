-- Everest Local Business Growth Engine P0
-- Business-owned recurring memberships and prepaid packages.
-- Stripe/webhooks remain financial authority. Customers must explicitly approve every paid commitment.
-- Service credits are an immutable server-authored ledger; no client-controlled balances exist.

create table if not exists public.business_membership_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC','PRIVATE','INVITE_ONLY')),
  price numeric(12,2) not null check (price > 0),
  currency text not null default 'aud' check (currency='aud'),
  billing_interval_unit text not null check (billing_interval_unit in ('DAY','WEEK','MONTH','YEAR')),
  billing_interval_count integer not null default 1 check (billing_interval_count between 1 and 365),
  check ((billing_interval_unit='DAY' and billing_interval_count<=365) or (billing_interval_unit='WEEK' and billing_interval_count<=52) or (billing_interval_unit='MONTH' and billing_interval_count<=12) or (billing_interval_unit='YEAR' and billing_interval_count<=3)),
  included_credits integer not null default 0 check (included_credits between 0 and 10000),
  included_services jsonb not null default '[]'::jsonb check (jsonb_typeof(included_services)='array'),
  service_frequency jsonb not null default '{}'::jsonb check (jsonb_typeof(service_frequency)='object'),
  benefits jsonb not null default '{}'::jsonb check (jsonb_typeof(benefits)='object'),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_membership_plans_business_active_idx on public.business_membership_plans(business_id,active,created_at desc);

create table if not exists public.customer_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid references public.business_membership_plans(id) on delete set null,
  contact_id uuid references public.business_contacts(id) on delete set null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 120),
  description text,
  price numeric(12,2) not null check (price > 0),
  currency text not null default 'aud' check (currency='aud'),
  billing_interval_unit text not null check (billing_interval_unit in ('DAY','WEEK','MONTH','YEAR')),
  billing_interval_count integer not null check (billing_interval_count between 1 and 365),
  check ((billing_interval_unit='DAY' and billing_interval_count<=365) or (billing_interval_unit='WEEK' and billing_interval_count<=52) or (billing_interval_unit='MONTH' and billing_interval_count<=12) or (billing_interval_unit='YEAR' and billing_interval_count<=3)),
  included_credits_per_period integer not null default 0 check (included_credits_per_period between 0 and 10000),
  included_services jsonb not null default '[]'::jsonb check (jsonb_typeof(included_services)='array'),
  service_frequency jsonb not null default '{}'::jsonb check (jsonb_typeof(service_frequency)='object'),
  benefits jsonb not null default '{}'::jsonb check (jsonb_typeof(benefits)='object'),
  start_date date not null default current_date,
  status text not null default 'INVITED' check (status in ('INVITED','INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCEL_AT_PERIOD_END','CANCELED')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  approval_requested_at timestamptz not null default now(),
  approved_at timestamptz,
  canceled_at timestamptz,
  last_stripe_event_id text,
  last_stripe_event_created_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_memberships_customer_idx on public.customer_memberships(customer_id,status,created_at desc);
create index if not exists customer_memberships_business_idx on public.customer_memberships(business_id,status,created_at desc);
create unique index if not exists customer_memberships_plan_active_uniq
  on public.customer_memberships(customer_id,plan_id)
  where plan_id is not null and status in ('INVITED','INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCEL_AT_PERIOD_END');

create table if not exists public.membership_billing_history (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.customer_memberships(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  stripe_invoice_id text not null unique,
  stripe_payment_intent_id text,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'aud' check (currency='aud'),
  status text not null check (status in ('PAID','FAILED','REFUNDED','VOID')),
  period_start timestamptz,
  period_end timestamptz,
  stripe_event_id text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists membership_billing_history_membership_idx on public.membership_billing_history(membership_id,occurred_at desc);
create index if not exists membership_billing_history_business_idx on public.membership_billing_history(business_id,status,occurred_at desc);

create table if not exists public.business_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC','PRIVATE','INVITE_ONLY')),
  price numeric(12,2) not null check (price > 0),
  currency text not null default 'aud' check (currency='aud'),
  credit_count integer not null check (credit_count between 1 and 10000),
  service_id uuid references public.services(id) on delete set null,
  expires_after_days integer check (expires_after_days is null or expires_after_days between 1 and 3650),
  benefits jsonb not null default '{}'::jsonb check (jsonb_typeof(benefits)='object'),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_packages_business_active_idx on public.business_packages(business_id,active,created_at desc);

create table if not exists public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  package_id uuid not null references public.business_packages(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  purchase_price numeric(12,2) not null check (purchase_price > 0),
  currency text not null default 'aud' check (currency='aud'),
  purchased_credits integer not null check (purchased_credits > 0),
  status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','EXHAUSTED','EXPIRED','REFUNDED','CANCELED')),
  purchase_idempotency_key text not null unique check (length(purchase_idempotency_key) between 16 and 128),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  purchased_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_packages_customer_idx on public.customer_packages(customer_id,status,created_at desc);
create index if not exists customer_packages_business_idx on public.customer_packages(business_id,status,created_at desc);

create table if not exists public.service_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  membership_id uuid references public.customer_memberships(id) on delete cascade,
  customer_package_id uuid references public.customer_packages(id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (length(trim(reason)) between 1 and 160),
  source_type text not null check (source_type in ('MEMBERSHIP_INVOICE','PACKAGE_PURCHASE','BOOKING_REDEMPTION','ADMIN_ADJUSTMENT','EXPIRY','REFUND')),
  source_id text,
  source_key text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((membership_id is not null)::integer + (customer_package_id is not null)::integer = 1)
);
create index if not exists service_credit_ledger_membership_idx on public.service_credit_ledger(membership_id,created_at);
create index if not exists service_credit_ledger_package_idx on public.service_credit_ledger(customer_package_id,created_at);
create index if not exists service_credit_ledger_customer_idx on public.service_credit_ledger(customer_id,created_at desc);

-- Direct writes are forbidden. Business/customer actions go through validated RPCs;
-- Stripe lifecycle writes are service-role only.
alter table public.business_membership_plans enable row level security;
alter table public.customer_memberships enable row level security;
alter table public.membership_billing_history enable row level security;
alter table public.business_packages enable row level security;
alter table public.customer_packages enable row level security;
alter table public.service_credit_ledger enable row level security;

revoke all on public.business_membership_plans,public.customer_memberships,public.membership_billing_history,public.business_packages,public.customer_packages,public.service_credit_ledger from public,anon;
revoke insert,update,delete on public.business_membership_plans,public.customer_memberships,public.membership_billing_history,public.business_packages,public.customer_packages,public.service_credit_ledger from authenticated;
grant select on public.business_membership_plans,public.customer_memberships,public.membership_billing_history,public.business_packages,public.customer_packages,public.service_credit_ledger to authenticated;

drop policy if exists growth_membership_plans_read on public.business_membership_plans;
create policy growth_membership_plans_read on public.business_membership_plans for select to authenticated
using ((active and visibility='PUBLIC') or public.is_business_member(business_id));

drop policy if exists growth_memberships_read on public.customer_memberships;
create policy growth_memberships_read on public.customer_memberships for select to authenticated
using (customer_id=(select auth.uid()) or public.is_business_member(business_id));

drop policy if exists growth_billing_history_read on public.membership_billing_history;
create policy growth_billing_history_read on public.membership_billing_history for select to authenticated
using (customer_id=(select auth.uid()) or public.is_business_member(business_id));

drop policy if exists growth_packages_read on public.business_packages;
create policy growth_packages_read on public.business_packages for select to authenticated
using ((active and visibility='PUBLIC') or public.is_business_member(business_id));

drop policy if exists growth_customer_packages_read on public.customer_packages;
create policy growth_customer_packages_read on public.customer_packages for select to authenticated
using (customer_id=(select auth.uid()) or public.is_business_member(business_id));

drop policy if exists growth_credit_ledger_read on public.service_credit_ledger;
create policy growth_credit_ledger_read on public.service_credit_ledger for select to authenticated
using (customer_id=(select auth.uid()) or public.is_business_member(business_id));

create or replace function public.growth_touch_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;

drop trigger if exists growth_plan_touch on public.business_membership_plans;
create trigger growth_plan_touch before update on public.business_membership_plans for each row execute function public.growth_touch_updated_at();
drop trigger if exists growth_membership_touch on public.customer_memberships;
create trigger growth_membership_touch before update on public.customer_memberships for each row execute function public.growth_touch_updated_at();
drop trigger if exists growth_package_touch on public.business_packages;
create trigger growth_package_touch before update on public.business_packages for each row execute function public.growth_touch_updated_at();
drop trigger if exists growth_customer_package_touch on public.customer_packages;
create trigger growth_customer_package_touch before update on public.customer_packages for each row execute function public.growth_touch_updated_at();

create or replace function public.prevent_service_credit_ledger_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Service credit ledger entries are immutable'; end $$;
drop trigger if exists service_credit_ledger_immutable_update on public.service_credit_ledger;
create trigger service_credit_ledger_immutable_update before update on public.service_credit_ledger for each row execute function public.prevent_service_credit_ledger_mutation();
drop trigger if exists service_credit_ledger_immutable_delete on public.service_credit_ledger;
create trigger service_credit_ledger_immutable_delete before delete on public.service_credit_ledger for each row execute function public.prevent_service_credit_ledger_mutation();

create or replace function public.create_business_membership_plan(
  p_business_id uuid,p_name text,p_description text,p_visibility text,p_price numeric,
  p_interval_unit text,p_interval_count integer,p_included_credits integer default 0,
  p_included_services jsonb default '[]'::jsonb,p_service_frequency jsonb default '{}'::jsonb,p_benefits jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Plan name is required'; end if;
  if p_visibility not in ('PUBLIC','PRIVATE','INVITE_ONLY') then raise exception 'Invalid plan visibility'; end if;
  if p_price is null or p_price<=0 then raise exception 'Plan price must be greater than zero'; end if;
  if p_interval_unit not in ('DAY','WEEK','MONTH','YEAR') or p_interval_count not between 1 and 365 or (p_interval_unit='WEEK' and p_interval_count>52) or (p_interval_unit='MONTH' and p_interval_count>12) or (p_interval_unit='YEAR' and p_interval_count>3) then raise exception 'Invalid billing interval'; end if;
  if coalesce(p_included_credits,0) not between 0 and 10000 then raise exception 'Invalid included credits'; end if;
  if jsonb_typeof(coalesce(p_included_services,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_service_frequency,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_benefits,'{}'::jsonb))<>'object' then raise exception 'Invalid plan configuration'; end if;
  insert into public.business_membership_plans(business_id,name,description,visibility,price,billing_interval_unit,billing_interval_count,included_credits,included_services,service_frequency,benefits,created_by)
  values(p_business_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_visibility,round(p_price,2),p_interval_unit,p_interval_count,coalesce(p_included_credits,0),coalesce(p_included_services,'[]'::jsonb),coalesce(p_service_frequency,'{}'::jsonb),coalesce(p_benefits,'{}'::jsonb),auth.uid())
  returning id into rid;
  return rid;
end $$;
revoke all on function public.create_business_membership_plan(uuid,text,text,text,numeric,text,integer,integer,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_business_membership_plan(uuid,text,text,text,numeric,text,integer,integer,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.set_business_membership_plan_active(p_plan_id uuid,p_active boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
  select business_id into bid from public.business_membership_plans where id=p_plan_id for update;
  if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
  update public.business_membership_plans set active=coalesce(p_active,false) where id=p_plan_id;
  return true;
end $$;
revoke all on function public.set_business_membership_plan_active(uuid,boolean) from public,anon;
grant execute on function public.set_business_membership_plan_active(uuid,boolean) to authenticated;

create or replace function public.create_business_package(
  p_business_id uuid,p_name text,p_description text,p_visibility text,p_price numeric,
  p_credit_count integer,p_service_id uuid default null,p_expires_after_days integer default null,p_benefits jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; service_bid uuid;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Package name is required'; end if;
  if p_visibility not in ('PUBLIC','PRIVATE','INVITE_ONLY') or p_price is null or p_price<=0 or p_credit_count not between 1 and 10000 then raise exception 'Invalid package'; end if;
  if p_expires_after_days is not null and p_expires_after_days not between 1 and 3650 then raise exception 'Invalid expiry'; end if;
  if p_service_id is not null then
    select business_id into service_bid from public.services where id=p_service_id and active;
    if service_bid is distinct from p_business_id then raise exception 'Service does not belong to this business'; end if;
  end if;
  insert into public.business_packages(business_id,name,description,visibility,price,credit_count,service_id,expires_after_days,benefits,created_by)
  values(p_business_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_visibility,round(p_price,2),p_credit_count,p_service_id,p_expires_after_days,coalesce(p_benefits,'{}'::jsonb),auth.uid())
  returning id into rid;
  return rid;
end $$;
revoke all on function public.create_business_package(uuid,text,text,text,numeric,integer,uuid,integer,jsonb) from public,anon;
grant execute on function public.create_business_package(uuid,text,text,text,numeric,integer,uuid,integer,jsonb) to authenticated;

create or replace function public.create_customer_membership_invitation(
  p_business_id uuid,p_contact_id uuid,p_plan_id uuid default null,p_custom_title text default null,
  p_custom_description text default null,p_custom_price numeric default null,p_interval_unit text default null,
  p_interval_count integer default null,p_included_credits integer default null,p_included_services jsonb default null,
  p_service_frequency jsonb default null,p_benefits jsonb default null,p_start_date date default current_date
) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.business_contacts; p public.business_membership_plans; rid uuid; title_v text; description_v text; price_v numeric; unit_v text; count_v integer; credits_v integer; services_v jsonb; frequency_v jsonb; benefits_v jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  select * into c from public.business_contacts where id=p_contact_id and business_id=p_business_id for update;
  if c.id is null then raise exception 'CRM customer not found'; end if;
  if c.linked_everest_user_id is null then raise exception 'This CRM customer must be linked to an Everest customer before a paid membership can be requested'; end if;

  if p_plan_id is not null then
    select * into p from public.business_membership_plans where id=p_plan_id and business_id=p_business_id and active;
    if p.id is null then raise exception 'Membership plan not found'; end if;
    title_v:=p.name;description_v:=p.description;price_v:=p.price;unit_v:=p.billing_interval_unit;count_v:=p.billing_interval_count;credits_v:=p.included_credits;services_v:=p.included_services;frequency_v:=p.service_frequency;benefits_v:=p.benefits;
  else
    title_v:=trim(coalesce(p_custom_title,''));description_v:=nullif(trim(coalesce(p_custom_description,'')),'');price_v:=p_custom_price;unit_v:=p_interval_unit;count_v:=p_interval_count;credits_v:=coalesce(p_included_credits,0);services_v:=coalesce(p_included_services,'[]'::jsonb);frequency_v:=coalesce(p_service_frequency,'{}'::jsonb);benefits_v:=coalesce(p_benefits,'{}'::jsonb);
    if length(title_v) not between 1 and 120 or price_v is null or price_v<=0 or unit_v not in ('DAY','WEEK','MONTH','YEAR') or count_v not between 1 and 365 or (unit_v='WEEK' and count_v>52) or (unit_v='MONTH' and count_v>12) or (unit_v='YEAR' and count_v>3) then raise exception 'Invalid custom membership'; end if;
  end if;

  insert into public.customer_memberships(business_id,plan_id,contact_id,customer_id,title,description,price,billing_interval_unit,billing_interval_count,included_credits_per_period,included_services,service_frequency,benefits,start_date,status,created_by)
  values(p_business_id,p_plan_id,c.id,c.linked_everest_user_id,title_v,description_v,round(price_v,2),unit_v,count_v,credits_v,services_v,frequency_v,benefits_v,coalesce(p_start_date,current_date),'INVITED',auth.uid())
  returning id into rid;

  insert into public.notifications(user_id,kind,title,body,data)
  values(c.linked_everest_user_id,'MEMBERSHIP_INVITATION','Membership approval requested',left((select name from public.businesses where id=p_business_id)||' invited you to '||title_v||'. Review and approve before any recurring billing starts.',500),jsonb_build_object('membership_id',rid,'business_id',p_business_id))
  on conflict do nothing;
  return rid;
end $$;
revoke all on function public.create_customer_membership_invitation(uuid,uuid,uuid,text,text,numeric,text,integer,integer,jsonb,jsonb,jsonb,date) from public,anon;
grant execute on function public.create_customer_membership_invitation(uuid,uuid,uuid,text,text,numeric,text,integer,integer,jsonb,jsonb,jsonb,date) to authenticated;

create or replace function public.prepare_membership_checkout(p_membership_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.customer_memberships; b public.businesses;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 16 and 128 then raise exception 'Invalid idempotency key'; end if;
  select * into m from public.customer_memberships where id=p_membership_id and customer_id=auth.uid() for update;
  if m.id is null then raise exception 'Membership invitation not found'; end if;
  if m.status in ('ACTIVE','TRIALING','CANCEL_AT_PERIOD_END','PAUSED','PAST_DUE') then raise exception 'Membership is already connected to billing'; end if;
  if m.status='CANCELED' then raise exception 'Membership invitation is canceled'; end if;
  select * into b from public.businesses where id=m.business_id and status='ACTIVE' and verification_status='VERIFIED';
  if b.id is null then raise exception 'Business is not available for membership billing'; end if;
  update public.customer_memberships set status=case when status='INVITED' then 'INCOMPLETE' else status end where id=m.id;
  return jsonb_build_object(
    'membership_id',m.id,'business_id',m.business_id,'customer_id',m.customer_id,'title',m.title,'price',m.price,'currency',m.currency,
    'interval_unit',m.billing_interval_unit,'interval_count',m.billing_interval_count,'start_date',m.start_date,
    'checkout_session_id',m.stripe_checkout_session_id,'idempotency_key',p_idempotency_key
  );
end $$;
revoke all on function public.prepare_membership_checkout(uuid,text) from public,anon;
grant execute on function public.prepare_membership_checkout(uuid,text) to authenticated;

create or replace function public.attach_membership_checkout_session(p_membership_id uuid,p_session_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.customer_memberships set stripe_checkout_session_id=coalesce(stripe_checkout_session_id,p_session_id)
  where id=p_membership_id and status='INCOMPLETE' and (stripe_checkout_session_id is null or stripe_checkout_session_id=p_session_id);
  if not found then raise exception 'Membership checkout could not be attached'; end if;
  return true;
end $$;
revoke all on function public.attach_membership_checkout_session(uuid,text) from public,anon,authenticated;
grant execute on function public.attach_membership_checkout_session(uuid,text) to service_role;

create or replace function public.prepare_package_checkout(p_package_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.business_packages; cp public.customer_packages;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 16 and 128 then raise exception 'Invalid idempotency key'; end if;
  select * into cp from public.customer_packages where purchase_idempotency_key=p_idempotency_key for update;
  if cp.id is not null then
    return jsonb_build_object('customer_package_id',cp.id,'package_id',cp.package_id,'business_id',cp.business_id,'customer_id',cp.customer_id,'price',cp.purchase_price,'currency',cp.currency,'credits',cp.purchased_credits,'checkout_session_id',cp.stripe_checkout_session_id,'reused',true);
  end if;
  select * into p from public.business_packages where id=p_package_id and active and visibility='PUBLIC';
  if p.id is null then raise exception 'Package is not available'; end if;
  if not exists(select 1 from public.businesses b where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED') then raise exception 'Business is not available'; end if;
  insert into public.customer_packages(business_id,package_id,customer_id,purchase_price,currency,purchased_credits,purchase_idempotency_key)
  values(p.business_id,p.id,auth.uid(),p.price,p.currency,p.credit_count,p_idempotency_key)
  returning * into cp;
  return jsonb_build_object('customer_package_id',cp.id,'package_id',p.id,'business_id',p.business_id,'customer_id',auth.uid(),'name',p.name,'price',p.price,'currency',p.currency,'credits',p.credit_count,'checkout_session_id',null,'reused',false);
end $$;
revoke all on function public.prepare_package_checkout(uuid,text) from public,anon;
grant execute on function public.prepare_package_checkout(uuid,text) to authenticated;

create or replace function public.attach_package_checkout_session(p_customer_package_id uuid,p_session_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.customer_packages set stripe_checkout_session_id=coalesce(stripe_checkout_session_id,p_session_id)
  where id=p_customer_package_id and status='PENDING' and (stripe_checkout_session_id is null or stripe_checkout_session_id=p_session_id);
  if not found then raise exception 'Package checkout could not be attached'; end if;
  return true;
end $$;
revoke all on function public.attach_package_checkout_session(uuid,text) from public,anon,authenticated;
grant execute on function public.attach_package_checkout_session(uuid,text) to service_role;

create or replace function public.set_customer_membership_from_stripe(
  p_membership_id uuid,p_customer_id text,p_subscription_id text,p_status text,p_period_start timestamptz,p_period_end timestamptz,
  p_cancel_at_period_end boolean,p_event_id text,p_event_created_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare normalized text;
begin
  if p_status not in ('TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELED','INCOMPLETE') then raise exception 'Invalid Stripe membership status'; end if;
  normalized:=case when p_status in ('ACTIVE','TRIALING') and coalesce(p_cancel_at_period_end,false) then 'CANCEL_AT_PERIOD_END' else p_status end;
  update public.customer_memberships set
    stripe_customer_id=coalesce(p_customer_id,stripe_customer_id),
    stripe_subscription_id=coalesce(p_subscription_id,stripe_subscription_id),
    status=normalized,
    current_period_start=p_period_start,
    current_period_end=p_period_end,
    approved_at=case when normalized in ('ACTIVE','TRIALING','CANCEL_AT_PERIOD_END') then coalesce(approved_at,now()) else approved_at end,
    canceled_at=case when normalized='CANCELED' then coalesce(canceled_at,now()) else canceled_at end,
    last_stripe_event_id=p_event_id,
    last_stripe_event_created_at=p_event_created_at
  where id=p_membership_id and (last_stripe_event_created_at is null or p_event_created_at>=last_stripe_event_created_at);
  if not found then
    if exists(select 1 from public.customer_memberships where id=p_membership_id and last_stripe_event_created_at>p_event_created_at) then return true; end if;
    raise exception 'Membership not found';
  end if;
  return true;
end $$;
revoke all on function public.set_customer_membership_from_stripe(uuid,text,text,text,timestamptz,timestamptz,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.set_customer_membership_from_stripe(uuid,text,text,text,timestamptz,timestamptz,boolean,text,timestamptz) to service_role;

create or replace function public.record_membership_invoice(
  p_membership_id uuid,p_invoice_id text,p_payment_intent_id text,p_amount numeric,p_currency text,p_status text,
  p_period_start timestamptz,p_period_end timestamptz,p_event_id text
) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.customer_memberships; grant_key text;
begin
  if p_status not in ('PAID','FAILED','REFUNDED','VOID') then raise exception 'Invalid invoice status'; end if;
  select * into m from public.customer_memberships where id=p_membership_id for update;
  if m.id is null then raise exception 'Membership not found'; end if;
  insert into public.membership_billing_history(membership_id,business_id,customer_id,stripe_invoice_id,stripe_payment_intent_id,amount,currency,status,period_start,period_end,stripe_event_id)
  values(m.id,m.business_id,m.customer_id,p_invoice_id,p_payment_intent_id,round(greatest(coalesce(p_amount,0),0),2),lower(coalesce(p_currency,'aud')),p_status,p_period_start,p_period_end,p_event_id)
  on conflict(stripe_invoice_id) do update set
    stripe_payment_intent_id=coalesce(excluded.stripe_payment_intent_id,public.membership_billing_history.stripe_payment_intent_id),
    amount=excluded.amount,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,stripe_event_id=excluded.stripe_event_id,occurred_at=now();

  if p_status='PAID' and m.included_credits_per_period>0 then
    grant_key:='membership_invoice:'||p_invoice_id;
    insert into public.service_credit_ledger(business_id,customer_id,membership_id,delta,reason,source_type,source_id,source_key)
    values(m.business_id,m.customer_id,m.id,m.included_credits_per_period,'Membership period credits','MEMBERSHIP_INVOICE',p_invoice_id,grant_key)
    on conflict(source_key) do nothing;
  end if;

  if p_status='FAILED' then
    update public.customer_memberships set status='PAST_DUE' where id=m.id and status not in ('CANCELED','PAUSED');
    insert into public.notifications(user_id,kind,title,body,data)
    values(m.customer_id,'MEMBERSHIP_PAYMENT_FAILED','Membership payment needs attention','A recurring membership payment failed. Update your payment method to keep benefits active.',jsonb_build_object('membership_id',m.id,'invoice_id',p_invoice_id))
    on conflict do nothing;
  end if;
  return true;
end $$;
revoke all on function public.record_membership_invoice(uuid,text,text,numeric,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.record_membership_invoice(uuid,text,text,numeric,text,text,timestamptz,timestamptz,text) to service_role;

create or replace function public.process_package_checkout_success(
  p_customer_package_id uuid,p_checkout_session_id text,p_payment_intent_id text,p_event_id text
) returns boolean language plpgsql security definer set search_path='' as $$
declare cp public.customer_packages; p public.business_packages; expiry timestamptz;
begin
  select * into cp from public.customer_packages where id=p_customer_package_id for update;
  if cp.id is null then raise exception 'Package purchase not found'; end if;
  if cp.status in ('ACTIVE','EXHAUSTED') then return true; end if;
  if cp.status<>'PENDING' then raise exception 'Package purchase is not payable'; end if;
  if cp.stripe_checkout_session_id is not null and cp.stripe_checkout_session_id<>p_checkout_session_id then raise exception 'Checkout session mismatch'; end if;
  select * into p from public.business_packages where id=cp.package_id;
  expiry:=case when p.expires_after_days is null then null else now()+make_interval(days=>p.expires_after_days) end;
  update public.customer_packages set status='ACTIVE',stripe_checkout_session_id=p_checkout_session_id,stripe_payment_intent_id=p_payment_intent_id,purchased_at=now(),expires_at=expiry where id=cp.id;
  insert into public.service_credit_ledger(business_id,customer_id,customer_package_id,delta,reason,source_type,source_id,source_key)
  values(cp.business_id,cp.customer_id,cp.id,cp.purchased_credits,'Prepaid package purchase','PACKAGE_PURCHASE',p_event_id,'package_purchase:'||cp.id)
  on conflict(source_key) do nothing;
  insert into public.notifications(user_id,kind,title,body,data)
  values(cp.customer_id,'PACKAGE_ACTIVATED','Package ready to use',coalesce(p.name,'Your package')||' is active with '||cp.purchased_credits||' service credits.',jsonb_build_object('customer_package_id',cp.id,'package_id',cp.package_id))
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.process_package_checkout_success(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.process_package_checkout_success(uuid,text,text,text) to service_role;

create or replace function public.redeem_service_credit(
  p_business_id uuid,p_customer_id uuid,p_booking_id uuid,p_membership_id uuid default null,p_customer_package_id uuid default null,p_credits integer default 1
) returns boolean language plpgsql security definer set search_path='' as $$
declare bal integer; booking_ok boolean; source_key_v text;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if p_credits not between 1 and 1000 then raise exception 'Invalid credit amount'; end if;
  if ((p_membership_id is not null)::integer + (p_customer_package_id is not null)::integer)<>1 then raise exception 'Choose one credit source'; end if;
  select exists(select 1 from public.bookings b where b.id=p_booking_id and b.business_id=p_business_id and b.customer_id=p_customer_id and b.status='COMPLETED') into booking_ok;
  if not booking_ok then raise exception 'Only a completed matching booking can redeem credits'; end if;
  source_key_v:='booking_redemption:'||p_booking_id::text||':'||coalesce(p_membership_id::text,p_customer_package_id::text);
  if exists(select 1 from public.service_credit_ledger where source_key=source_key_v) then return true; end if;

  if p_membership_id is not null then
    if not exists(select 1 from public.customer_memberships where id=p_membership_id and business_id=p_business_id and customer_id=p_customer_id and status in ('ACTIVE','TRIALING','CANCEL_AT_PERIOD_END')) then raise exception 'Membership credits unavailable'; end if;
    select coalesce(sum(delta),0)::integer into bal from public.service_credit_ledger where membership_id=p_membership_id;
    if bal<p_credits then raise exception 'Not enough membership credits'; end if;
    insert into public.service_credit_ledger(business_id,customer_id,membership_id,delta,reason,source_type,source_id,source_key,created_by)
    values(p_business_id,p_customer_id,p_membership_id,-p_credits,'Completed service redemption','BOOKING_REDEMPTION',p_booking_id::text,source_key_v,auth.uid());
  else
    if not exists(select 1 from public.customer_packages where id=p_customer_package_id and business_id=p_business_id and customer_id=p_customer_id and status='ACTIVE' and (expires_at is null or expires_at>now())) then raise exception 'Package credits unavailable'; end if;
    select coalesce(sum(delta),0)::integer into bal from public.service_credit_ledger where customer_package_id=p_customer_package_id;
    if bal<p_credits then raise exception 'Not enough package credits'; end if;
    insert into public.service_credit_ledger(business_id,customer_id,customer_package_id,delta,reason,source_type,source_id,source_key,created_by)
    values(p_business_id,p_customer_id,p_customer_package_id,-p_credits,'Completed service redemption','BOOKING_REDEMPTION',p_booking_id::text,source_key_v,auth.uid());
    if bal-p_credits<=0 then update public.customer_packages set status='EXHAUSTED' where id=p_customer_package_id and status='ACTIVE'; end if;
  end if;
  return true;
end $$;
revoke all on function public.redeem_service_credit(uuid,uuid,uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.redeem_service_credit(uuid,uuid,uuid,uuid,uuid,integer) to authenticated;

create or replace function public.get_business_growth_metrics(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'active_members',(select count(*) from public.customer_memberships where business_id=p_business_id and status in ('ACTIVE','TRIALING','CANCEL_AT_PERIOD_END')),
    'mrr',coalesce((select round(sum(
      case billing_interval_unit
        when 'DAY' then price*(30.4375/billing_interval_count)
        when 'WEEK' then price*((52.0/12.0)/billing_interval_count)
        when 'MONTH' then price*(1.0/billing_interval_count)
        when 'YEAR' then price*((1.0/12.0)/billing_interval_count)
      end
    ),2) from public.customer_memberships where business_id=p_business_id and status in ('ACTIVE','TRIALING','CANCEL_AT_PERIOD_END')),0),
    'recurring_booking_series',(select count(*) from public.booking_series where business_id=p_business_id and active),
    'package_revenue',coalesce((select round(sum(purchase_price),2) from public.customer_packages where business_id=p_business_id and status in ('ACTIVE','EXHAUSTED')),0),
    'membership_cancellations_30d',(select count(*) from public.customer_memberships where business_id=p_business_id and status='CANCELED' and canceled_at>=now()-interval '30 days'),
    'failed_membership_payments_30d',(select count(*) from public.membership_billing_history where business_id=p_business_id and status='FAILED' and occurred_at>=now()-interval '30 days'),
    'credits_outstanding',coalesce((select sum(greatest(balance,0)) from (
      select coalesce(sum(delta),0)::integer balance from public.service_credit_ledger where business_id=p_business_id group by membership_id,customer_package_id
    ) x),0),
    'plans',(select count(*) from public.business_membership_plans where business_id=p_business_id and active),
    'packages',(select count(*) from public.business_packages where business_id=p_business_id and active)
  ) into result;
  return result;
end $$;
revoke all on function public.get_business_growth_metrics(uuid) from public,anon;
grant execute on function public.get_business_growth_metrics(uuid) to authenticated;

create or replace function public.get_customer_growth_summary(p_business_id uuid,p_contact_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid; result jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  select linked_everest_user_id into uid from public.business_contacts where id=p_contact_id and business_id=p_business_id;
  if uid is null then return jsonb_build_object('linked',false,'memberships','[]'::jsonb,'packages','[]'::jsonb); end if;
  select jsonb_build_object(
    'linked',true,
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'status',m.status,'price',m.price,'interval_unit',m.billing_interval_unit,'interval_count',m.billing_interval_count,'current_period_end',m.current_period_end,'credits',coalesce((select sum(l.delta) from public.service_credit_ledger l where l.membership_id=m.id),0)) order by m.created_at desc) from public.customer_memberships m where m.business_id=p_business_id and m.customer_id=uid),'[]'::jsonb),
    'packages',coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'name',bp.name,'status',cp.status,'credits_remaining',coalesce((select sum(l.delta) from public.service_credit_ledger l where l.customer_package_id=cp.id),0),'expires_at',cp.expires_at) order by cp.created_at desc) from public.customer_packages cp join public.business_packages bp on bp.id=cp.package_id where cp.business_id=p_business_id and cp.customer_id=uid),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.get_customer_growth_summary(uuid,uuid) from public,anon;
grant execute on function public.get_customer_growth_summary(uuid,uuid) to authenticated;

-- Financial/service-role functions must not be callable by app roles.
revoke all on function public.attach_membership_checkout_session(uuid,text) from public,anon,authenticated;
revoke all on function public.attach_package_checkout_session(uuid,text) from public,anon,authenticated;
revoke all on function public.set_customer_membership_from_stripe(uuid,text,text,text,timestamptz,timestamptz,boolean,text,timestamptz) from public,anon,authenticated;
revoke all on function public.record_membership_invoice(uuid,text,text,numeric,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.process_package_checkout_success(uuid,text,text,text) from public,anon,authenticated;
