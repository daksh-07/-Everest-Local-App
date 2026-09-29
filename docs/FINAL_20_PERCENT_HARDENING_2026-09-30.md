# Everest Local — Final 20% Hardening Audit

Date: 30 September 2026 (Australia/Sydney)

This record documents production hardening completed after the final UI/UX merge on `main`. It is intentionally focused on effective production behavior, not feature expansion.

## Restored merge regressions

- Restored live Home weather rendering on top of the final launch UI.
- Restored session-gating for global Everest Live / business opportunity pollers.
- Added regression coverage so signed-out sessions do not mount protected background pollers.
- Removed the disabled external-business discovery CTA from launch search while production feature flags remain OFF.

## Live security verification

Against the production Supabase project:

- a real customer account can read its own service requests;
- an unrelated authenticated account read zero of that customer's requests;
- a real business member can read its own membership;
- an unrelated authenticated account read zero business memberships;
- no anonymous SECURITY DEFINER write function is exposed;
- authenticated SECURITY DEFINER write functions were scanned for actor/admin/business authorization guards;
- public tables remain RLS protected.

## Marketplace fee correction

Launch fee policy is now `2026-09-v2`:

- service jobs under $200: 5%, with a $5 minimum capped at the payment amount;
- $200–$500: 5%;
- over $500–$1,000: 3.5%;
- over $1,000: 2.8%;
- products: 5% of product subtotal.

The production function was verified at fee boundaries. Service deposit + balance payments reserve the fee once from the whole quoted job rather than charging each instalment independently.

## Payment and lifecycle invariants restored

Production now enforces:

- Stripe is authoritative for confirmation of paid marketplace bookings;
- an unpaid marketplace booking cannot be marked complete;
- a paid service booking cannot be self-cancelled without payment reconciliation;
- a service booking cannot be cancelled while an existing Stripe Checkout session is still open;
- a product order reservation cannot be client-released after a Stripe Checkout session exists;
- marketplace quote creation and acceptance require the business to be Stripe payout-ready;
- Business Mode rejects zero-value marketplace quotes;
- employee My Work completion routes through the authoritative booking status/payment guard instead of directly completing the booking;
- non-admin businesses cannot self-cancel a paid product order without refund reconciliation;
- failed/cancelled Everest Delivery returns a paid order to READY_FOR_PICKUP rather than silently cancelling the paid order;
- failed/cancelled deliveries can be requested again;
- failed/cancelled delivery assignments are closed so the driver is not left falsely busy.

## Existing-data integrity check

At audit time production contained:

- 0 unpaid completed marketplace bookings;
- 0 paid-but-cancelled product orders;
- 0 open service Stripe Checkout sessions;
- 0 open product Stripe Checkout sessions;
- 0 invalid negative payout-ledger rows;
- 0 inconsistent ACTIVE Stripe Connect rows.

## Runtime observations

In the last-hour runtime check after hardening:

- no REST/API 401 storm remained;
- no application/backend 400, 409 or 422 spike was present;
- no app/API 5xx errors were present.

## Remaining external release gates

These are not code defects and must not be bypassed in source:

1. The currently connected business Stripe account must finish Stripe-hosted onboarding until details, charges and payouts are enabled. Do not mark it ACTIVE manually.
2. Supabase Auth leaked-password protection is still a dashboard configuration warning and should be enabled.
3. A signed production/preview build still requires physical iPhone and Android validation for permissions, safe areas, keyboard, deep links, background push, camera/photos, location, checkout and account deletion.
4. App Store / Play signing, store records and release declarations require the operator's Apple/Google accounts.
5. Real Stripe payment/webhook success, failure, expiry, retry and duplicate-event behavior should be exercised with controlled live/test transactions before taking unrestricted public payments.

No fake businesses, payments, reviews, orders or verification state were introduced to satisfy these gates.
