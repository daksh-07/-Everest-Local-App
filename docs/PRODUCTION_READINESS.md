# Everest Local — Production Readiness / Current State

Audit date: 2026-09-17
Repository: `daksh-07/-Everest-Local-App`
Current engineering head at this update: `85381fe13897a37051a158f055f2aa1ebb19e862`

## Status definitions

- **VERIFIED** — source plus completed CI evidence supports the behavior.
- **PARTIALLY VERIFIED** — implementation exists, but live provider/database/device execution is still required.
- **UNVERIFIED** — the relevant runtime has not been executed in this environment.
- **MISSING** — required MVP capability is not implemented.
- **BLOCKED BY HUMAN CONFIGURATION** — completion requires a real external account, secret, deployed backend, device or provider.

No fake businesses, products, reviews, orders, payments, availability or delivery records are included.

## Current CI evidence

GitHub Actions run `35217683586` completed successfully for engineering head `85381fe13897a37051a158f055f2aa1ebb19e862`.

Mobile validation passed:
- `npm install --no-audit --no-fund`
- TypeScript
- ESLint
- static security/navigation audit
- ordered migration audit (`001` through `032`)
- Expo Doctor
- Expo web export

Supabase validation passed Deno type-checking for all Edge Functions.

CI is source/build validation only. It does not execute a live Supabase database, Stripe account, native deep links, or real provider integrations.

## 1. Service marketplace

**Implemented / source-verified:**

Customer path: request → deterministic matching → opportunities → quote → acceptance → booking → service deposit checkout → verified Stripe webhook → booking confirmation → completion → transaction review.

Business path: business registration → verification → services/service areas → matched opportunities → quote → messaging → booking operations → completion.

Sensitive lifecycle operations use server-authorized RPCs rather than client table writes. Quote acceptance creates the booking transactionally, and booking transitions are constrained by the backend state machine.

**Remaining runtime verification:** two-account RLS tests, live Stripe service payment, native interaction, and deployed PostgreSQL execution.

## 2. Product marketplace

**Implemented / source-verified:**

- Verified-business product discovery.
- Product create/edit/archive/status controls.
- Inventory adjustment through controlled RPCs.
- Persistent customer cart.
- Concurrency-safe cart creation.
- Locked inventory reservation during checkout.
- One active checkout per customer cart.
- Server-authoritative product price, business publication state and inventory.
- Product delivery eligibility and pickup capability are validated server-side.
- Product checkout can select pickup or Everest Delivery and capture a delivery address.
- Stripe Checkout is created only from persisted order items.
- Signed Stripe webhook drives payment/order finalization.
- Exact source cart-item IDs are snapshotted on order items so later cart edits are not deleted accidentally.
- Customer order screen shows order and delivery state.
- Business order screen shows fulfilment and delivery state.

**Remaining runtime verification:** live Stripe payment/webhook, concurrent checkout against a deployed database, and cross-business/customer adversarial RLS testing.

## 3. Everest Delivery

**Implemented / source-verified:**

- Business can request delivery only for its own paid, delivery-eligible order after `READY_FOR_PICKUP`.
- Admin can assign an actual `DELIVERY_DRIVER` account.
- Assigned drivers/admins can advance delivery through pickup → in transit → delivered.
- Cancellation/failure transitions are authorized by backend state rules.
- Paid orders are deliberately not silently cancelled when a delivery fails; a refund workflow must exist before payment reversal is performed.
- Customer and business delivery visibility is RLS-scoped.
- Delivery status changes generate participant notifications.
- Delivery operations are audited.

**Remaining runtime verification:** deployed RLS/state transitions, real driver accounts and any external logistics/maps integration.

## 4. Ask Everest AI

**Implemented / source-verified:**

- AI credentials are read only by the Edge Function.
- Mobile code never receives the AI key or service-role key.
- Requests require authentication and are length-limited.
- The backend supplies only RLS-visible verified businesses and active products to the model.
- System instructions explicitly prohibit invented marketplace facts, private data, credentials and internal identifiers.
- UI has loading, empty/fallback and error states.

**Remaining runtime verification:** real AI provider, timeout/availability behavior and production prompt/data evaluation. AI should not be treated as authoritative for transactions; checkout and availability remain backend-controlled.

## 5. Search / discovery

**Implemented:** real database-backed business/product search with verified-business/product visibility, empty states and no fake records.

**Not yet full advanced discovery:** radius/distance search, rich price/category/availability filtering and optimized ranking are not implemented as a complete search subsystem. These are non-blocking for the current transactional MVP but remain expansion work.

## 6. Customer experience

Core customer screens have loading/error/empty states and authenticated route protection. Cart and orders include retry/error handling, fulfilment selection and delivery tracking. Messaging handles loading/errors and uses participant-scoped backend access.

Native device interaction, keyboard behavior, accessibility, offline/reconnect behavior and physical deep-link testing still require a real runtime.

## 7. Business experience

Business dashboard now exposes services, service areas, opportunities/quotes, bookings, products/inventory, customer orders and verification. Business booking operations use the existing server-authorized booking state machine. Customer data shown in business workflows is intentionally limited to data already authorized by the relevant RLS policies.

Business verification documents/media upload remains outside the current MVP because storage/upload infrastructure is not configured.

## 8. Admin / trust & safety

Admin route protection is enforced in the client as UX only; sensitive operations are server-authorized. Admin verification actions use an authorization-checked RPC and are auditable. Delivery assignment requires an actual `DELIVERY_DRIVER` role.

The current admin UI is an operations foundation, not a complete moderation/disputes console. Advanced dispute, suspicious-activity and account-management workflows remain expansion work.

## 9. Security audit

### Verified in source / CI

- Sensitive tables have explicit RLS policies.
- Client writes to authoritative payment, payout, audit, admin and lifecycle records are revoked where server control is required.
- SECURITY DEFINER functions explicitly set `search_path=public`.
- Caller identity is derived from `auth.uid()` for sensitive operations.
- Product checkout does not trust client prices, totals, stock, product publication state or business verification state.
- Inventory reservation/finalization is lock-protected and transactional.
- Checkout idempotency is customer-scoped; service-payment idempotency is scoped to the exact customer/booking.
- Stripe webhook signatures are verified before processing.
- Stripe event IDs are claimed and completion/failure is persisted for retry handling.
- Messaging conversation creation derives customer identity from the service request and verifies business/request relationships.
- Message mutation is revoked; participant access is enforced by RLS.
- Reviews are restricted to completed customer transactions.
- Business verification changes are server-authorized.
- No service-role or Stripe secret is bundled into Expo code.
- Static audit rejects credential-like secrets and TypeScript suppression directives.
- Navigation references are statically checked against Expo Router routes.

### Still requires live verification

- Adversarial Customer A/B and Business A/B RLS tests.
- Live PostgreSQL migration execution and constraint/policy behavior.
- Live Stripe test-mode webhook and duplicate/retry behavior.
- Native iOS/Android deep-link and authentication recovery tests.
- Real AI provider behavior.
- Storage policy testing if uploads are enabled.

## 10. Database / migration chain

Current repository contains numbered migrations `001` through `032` with no numbering gap. CI now runs `scripts/migration-audit.mjs` and validates ordering, non-empty files and explicit public search paths for SECURITY DEFINER functions.

Important later hardening includes:

- `025_checkout_item_snapshot.sql` — exact source cart-item cleanup.
- `026_delivery_operations.sql` — real delivery request/assignment/state operations.
- `027_product_delivery_checkout.sql` — server-authoritative fulfilment choice and verified-business checkout validation.
- `028_service_payment_idempotency_scope.sql` — service checkout idempotency isolation.
- `029_delivery_payment_integrity.sql` — prevents paid-order cancellation on delivery failure without a refund workflow.
- `030_delivery_notifications.sql` — delivery participant notifications.
- `031_cart_creation_concurrency.sql` — atomic cart creation.
- `032_cart_authority_hardening.sql` — prevents direct client cart-row writes.

A clean Supabase project still needs a real `supabase db reset` / migration application run. CI cannot perform this because no target database is configured.

## 11. Testing

The repository currently has no dedicated integration/E2E test runner. CI provides TypeScript, ESLint, static security/navigation checks, migration checks, Expo Doctor, web bundling and Edge Function type validation.

The highest-value missing tests are live authorization/RLS tests, PostgreSQL migration execution, Stripe test-mode webhook scenarios, concurrent checkout, and native recovery/deep-link tests. These are environment-dependent rather than safely reproducible against this repository alone.

## 12. Performance

The current implementation uses bounded marketplace result sets, debounced search, server-side checkout calculations and indexed transactional paths introduced by the database migrations. No speculative large optimization was added.

Further profiling should be performed against real data before changing query strategy or list virtualization.

## 13. Production configuration

Public mobile configuration belongs in `EXPO_PUBLIC_*` variables. Server-only credentials belong in Supabase Edge Function/server configuration. `.env.example` documents this separation.

Required real configuration before launch:

1. Supabase project/Auth configuration and all migrations applied.
2. Stripe secret, webhook secret and registered webhook endpoint.
3. Supabase Auth redirect URLs for web and `everestlocal://` native recovery.
4. AI provider endpoint/key/model if Ask Everest is enabled.
5. Real verified businesses/categories/services/products populated through controlled workflows.
6. iOS/Android build signing and device testing.
7. Notification provider configuration if push/email/SMS is enabled.
8. Delivery/logistics infrastructure if real-world delivery is enabled.

No secrets are committed.

## 14. Known MVP boundaries

These are intentionally not represented as completed merely because adjacent architecture exists:

- Stripe Connect/KYC, marketplace payouts/transfers, refunds and disputes.
- External logistics/maps/driver dispatch integration.
- Push/email/SMS delivery infrastructure.
- Marketplace media/storage upload pipeline.
- Background scheduler/queue for expiry and re-matching.
- Full advanced search/radius/ranking subsystem.
- Full admin disputes/moderation console.
- Dedicated live integration/E2E test environment.

These should be treated as post-core MVP infrastructure unless the launch plan explicitly requires them.

## Release assessment

**Engineering source/CI status: release-candidate level.** The core service, product checkout, inventory, messaging, booking, payment architecture and delivery workflows are implemented and the current CI gate is green.

**External production status: not yet verified.** The repository cannot truthfully claim live production readiness until the target Supabase project, Stripe account/webhook, native builds/devices and any enabled AI/notification/delivery providers have been configured and exercised.

The correct next step after this code-level gate is deployment-environment validation, not adding fake data or bypassing security controls.
