-- Stripe can retry and deliver events out of order.  Do not let an older
-- subscription event overwrite a more recent entitlement state.
alter table public.business_subscriptions
  add column if not exists last_stripe_event_created_at timestamptz;

create or replace function public.set_business_subscription_from_stripe(
  p_business_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_id text,
  p_event_created_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  current_event_created_at timestamptz;
begin
  if p_status not in ('INACTIVE','TRIALING','ACTIVE','PAST_DUE','UNPAID','CANCELED','INCOMPLETE','INCOMPLETE_EXPIRED','PAUSED') then
    raise exception 'Invalid subscription status';
  end if;
  if p_event_created_at is null then
    raise exception 'Stripe event timestamp is required';
  end if;

  select last_stripe_event_created_at into current_event_created_at
  from public.business_subscriptions
  where business_id=p_business_id
  for update;

  if current_event_created_at is not null and current_event_created_at > p_event_created_at then
    return false;
  end if;

  insert into public.business_subscriptions(
    business_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end,cancel_at_period_end,last_stripe_event_id,last_stripe_event_created_at,updated_at
  ) values(
    p_business_id,p_customer_id,p_subscription_id,p_price_id,p_status,p_current_period_end,coalesce(p_cancel_at_period_end,false),p_event_id,p_event_created_at,now()
  )
  on conflict (business_id) do update set
    stripe_customer_id=coalesce(excluded.stripe_customer_id,public.business_subscriptions.stripe_customer_id),
    stripe_subscription_id=coalesce(excluded.stripe_subscription_id,public.business_subscriptions.stripe_subscription_id),
    stripe_price_id=coalesce(excluded.stripe_price_id,public.business_subscriptions.stripe_price_id),
    status=excluded.status,
    current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    last_stripe_event_id=excluded.last_stripe_event_id,
    last_stripe_event_created_at=excluded.last_stripe_event_created_at,
    updated_at=now();

  return true;
end;
$$;

revoke all on function public.set_business_subscription_from_stripe(uuid,text,text,text,text,timestamptz,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.set_business_subscription_from_stripe(uuid,text,text,text,text,timestamptz,boolean,text,timestamptz) to service_role;
