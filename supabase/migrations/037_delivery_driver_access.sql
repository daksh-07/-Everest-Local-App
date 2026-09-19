-- Allow an assigned delivery driver to read only the delivery records assigned to that driver.
-- Keep all delivery writes server-authorized through existing SECURITY DEFINER RPCs.

drop policy if exists deliveries_participant on public.deliveries;

create policy deliveries_participant
on public.deliveries
for select
to public
using (
  exists (
    select 1
    from public.orders o
    where o.id = deliveries.order_id
      and (
        o.customer_id = auth.uid()
        or public.is_business_member(o.business_id)
      )
  )
  or public.is_admin()
  or exists (
    select 1
    from public.delivery_assignments da
    where da.delivery_id = deliveries.id
      and da.driver_id = auth.uid()
  )
);
