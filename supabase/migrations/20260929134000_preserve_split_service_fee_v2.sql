-- Preserve the approved v2 service fee across deposit + balance payments.
-- The platform fee is based on the whole quoted job, not each instalment.

create or replace function public.apply_service_payment_fee()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  job_total numeric;
  full_fee numeric;
  prior_fee numeric;
begin
  select q.total into job_total
  from public.quotes q
  where q.id=new.quote_id;

  full_fee:=public.calculate_service_platform_fee(coalesce(job_total,new.amount));

  select coalesce(sum(sp.marketplace_fee),0)
  into prior_fee
  from public.service_payments sp
  where sp.booking_id=new.booking_id
    and sp.id is distinct from new.id
    and sp.status='SUCCEEDED';

  new.marketplace_fee:=round(
    least(new.amount,greatest(full_fee-prior_fee,0)),
    2
  );
  new.provider_net:=round(greatest(new.amount-new.marketplace_fee,0),2);
  new.fee_policy_version:='2026-09-v2';
  return new;
end
$$;

revoke all on function public.apply_service_payment_fee() from public,anon,authenticated;
