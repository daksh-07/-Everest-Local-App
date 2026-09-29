-- Product-order creation must remain safe even if an authenticated client calls
-- create_order_from_cart directly instead of using the Checkout Edge Function.

create or replace function public.enforce_order_business_payment_readiness()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='PENDING'
     and new.payment_status='PENDING'
     and not public.is_business_payment_ready(new.business_id) then
    raise exception 'This business is not ready to receive Everest payments';
  end if;
  return new;
end
$$;

drop trigger if exists trg_enforce_order_business_payment_readiness on public.orders;
create trigger trg_enforce_order_business_payment_readiness
before insert on public.orders
for each row execute function public.enforce_order_business_payment_readiness();

revoke all on function public.enforce_order_business_payment_readiness() from public,anon,authenticated;
