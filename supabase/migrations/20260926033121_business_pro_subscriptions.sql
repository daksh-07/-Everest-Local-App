-- Everest Pro recurring subscription entitlements.
-- Stripe remains the source of truth; clients can read entitlement state but cannot write it.

create table if not exists public.business_subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'INACTIVE' check (status in ('INACTIVE','TRIALING','ACTIVE','PAST_DUE','UNPAID','CANCELED','INCOMPLETE','INCOMPLETE_EXPIRED','PAUSED')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_stripe_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_subscriptions_status_idx on public.business_subscriptions(status,current_period_end);

alter table public.business_subscriptions enable row level security;
revoke all on public.business_subscriptions from anon,authenticated;
grant select on public.business_subscriptions to authenticated;

drop policy if exists business_subscriptions_member_select on public.business_subscriptions;
create policy business_subscriptions_member_select
on public.business_subscriptions
for select to authenticated
using (public.is_business_member(business_id));

create or replace function public.business_has_pro(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.business_subscriptions s
    where s.business_id=p_business_id
      and s.status in ('ACTIVE','TRIALING')
  ) and public.is_business_member(p_business_id);
$$;

revoke all on function public.business_has_pro(uuid) from public,anon,authenticated;
grant execute on function public.business_has_pro(uuid) to authenticated;

create or replace function public.set_business_subscription_from_stripe(
  p_business_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_id text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_status not in ('INACTIVE','TRIALING','ACTIVE','PAST_DUE','UNPAID','CANCELED','INCOMPLETE','INCOMPLETE_EXPIRED','PAUSED') then
    raise exception 'Invalid subscription status';
  end if;

  insert into public.business_subscriptions(
    business_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end,cancel_at_period_end,last_stripe_event_id,updated_at
  ) values(
    p_business_id,p_customer_id,p_subscription_id,p_price_id,p_status,p_current_period_end,coalesce(p_cancel_at_period_end,false),p_event_id,now()
  )
  on conflict (business_id) do update set
    stripe_customer_id=coalesce(excluded.stripe_customer_id,public.business_subscriptions.stripe_customer_id),
    stripe_subscription_id=coalesce(excluded.stripe_subscription_id,public.business_subscriptions.stripe_subscription_id),
    stripe_price_id=coalesce(excluded.stripe_price_id,public.business_subscriptions.stripe_price_id),
    status=excluded.status,
    current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    last_stripe_event_id=excluded.last_stripe_event_id,
    updated_at=now();

  return true;
end;
$$;

revoke all on function public.set_business_subscription_from_stripe(uuid,text,text,text,text,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.set_business_subscription_from_stripe(uuid,text,text,text,text,timestamptz,boolean,text) to service_role;
