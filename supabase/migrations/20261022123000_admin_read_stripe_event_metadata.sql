-- Everest Local: let the admin Command Center read Stripe webhook processing metadata.
--
-- The Stripe Events resource in /admin-operations always failed with
-- "permission denied" because every client grant on stripe_events is revoked.
-- The table holds only event id, type, processing status and timestamps (no
-- payloads or payment details), which an admin needs to see when a payment or
-- payout is stuck. Reads are limited to is_admin() (password + MFA session);
-- other roles see zero rows and writes stay service-role only.
grant select on public.stripe_events to authenticated;

drop policy if exists stripe_events_admin_read on public.stripe_events;
create policy stripe_events_admin_read on public.stripe_events
for select to authenticated
using (public.is_admin());
