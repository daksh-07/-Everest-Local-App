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
- cart mutation cannot cancel/release a pending product order once Stripe Checkout exists;
- cart purchase validation re-checks business payout readiness;
- inventory updates cannot auto-reactivate an OUT_OF_STOCK product around the authoritative product publishing gate;
- instant bookings require Stripe payout readiness, use the authoritative minimum deposit, set marketplace payment required, and enter PENDING_PAYMENT;
- direct authenticated product-order creation is blocked by a database trigger when the business is not payout-ready.

## Existing-data integrity check

At audit time production contained:

- 0 unpaid completed marketplace bookings;
- 0 paid-but-cancelled product orders;
- 0 open service Stripe Checkout sessions;
- 0 open product Stripe Checkout sessions;
- 0 invalid negative payout-ledger rows;
- 0 inconsistent ACTIVE Stripe Connect rows.

## Runtime observations

The production Stripe webhook was also migrated off the legacy `esm.sh` Stripe build after live Edge logs exposed repeated `Deno.core.runMicrotasks()` runtime failures. It now uses pinned `npm:stripe@22.6.2`, `Stripe.createSubtleCryptoProvider()`, and asynchronous `constructEventAsync()` signature verification. The full Edge Function type-check suite passes, production `stripe-webhook` is ACTIVE on the new build, post-deploy sampled logs show no new backend/runtime error spike, and the Stripe event ledger contains no claimed/stuck events requiring repair.

In the last-hour runtime check after hardening:

- no REST/API 401 storm remained;
- no application/backend 400, 409 or 422 spike was present;
- no app/API 5xx errors were present.

## Remaining external release gates

These are not code defects and must not be bypassed in source:

1. The currently connected business Stripe account must finish Stripe-hosted onboarding until details, charges and payouts are enabled. Do not mark it ACTIVE manually.
2. Supabase Auth leaked-password protection is still a dashboard configuration warning and should be enabled.
3. Signed production/preview builds still require physical iPhone, iPad and Android validation for permissions, safe areas, rotation/tablet layout, keyboard, deep links, background push, camera/photos, location, checkout and account deletion.
4. App Store / Play signing, store records and release declarations require the operator's Apple/Google accounts.
5. Real Stripe payment/webhook success, failure, expiry, retry and duplicate-event behavior should be exercised with controlled live/test transactions before taking unrestricted public payments.

Automated native configuration gates now pass for both iOS and Android: iOS prebuild verifies the iPhone + iPad device family and production APNs entitlement; Android prebuild compiles a release AAB and verifies the merged Play manifest/package/notification permission.

No fake businesses, payments, reviews, orders or verification state were introduced to satisfy these gates.


## Second-pass findings and fixes

A second production sweep after the initial hardening found and fixed additional edge cases:

- service checkout now checks payout readiness before creating/reusing a payment attempt, and the live Edge Function marks a payout-blocked no-session attempt FAILED instead of stranding it as PENDING;
- account hard deletion now retains marketplace billing/subscription, moderation, support, driver/compliance and message-history evidence that the prior preflight omitted;
- private user-audio reads now inherit the visibility/block/business-verification rules of the post using the audio;
- product-media insert/update/delete now requires CATALOG_MANAGE (or admin), rather than generic business membership;
- cross-system delivery/service dispatch exclusivity was re-audited and confirmed to be protected by live advisory-lock triggers, with zero current overlaps;
- push dispatch is enabled/configured and Everest Live/service-dispatch cron workers are active; production currently has no registered native push tokens, so physical-device push remains an external QA gate;
- the service-checkout Edge Function was explicitly redeployed as version 14 with JWT verification enabled;
- Supabase migration history was reconciled to the committed migration filenames so future Git-based database deploys can run deterministically.

Final live-state sanity after the second pass:

- 0 orphan PENDING service payments without Checkout Sessions;
- 0 unpaid completed marketplace bookings;
- 0 paid-cancelled product orders;
- 0 cross-domain active dispatch overlaps;
- no 401/5xx runtime spike in the sampled production window;
- all external-business rollout flags remain OFF.
