# Everest Local — Launch Checklist

Audit date: 2026-09-17

This checklist separates repository evidence from live-environment evidence. A green CI run is not treated as proof of live Supabase, Stripe, device, provider, or operational readiness.

## READY — verified at repository / CI level

- [x] Expo/React Native TypeScript source type-checks in CI.
- [x] ESLint passes in CI.
- [x] Static secret/navigation audit runs in CI.
- [x] Ordered migration audit runs in CI; migrations are numbered 001–032.
- [x] Security invariant tests are part of the CI gate.
- [x] Expo Doctor runs in CI.
- [x] Expo web export runs in CI.
- [x] All Supabase Edge Functions pass Deno type-checking in CI.
- [x] Client does not contain Stripe secret/service-role credentials.
- [x] SECURITY DEFINER functions are required to pin `search_path=public` by repository validation.
- [x] Product checkout uses server-authoritative product state, inventory and totals.
- [x] Cart creation is concurrency-safe and direct client cart-row writes are revoked.
- [x] Checkout snapshots exact source cart-item IDs for cleanup after successful payment.
- [x] Service payment idempotency is scoped to the authenticated customer and booking.
- [x] Stripe webhook signature verification and event-idempotency architecture are present in source.
- [x] Booking, order and delivery lifecycle operations use server authorization/state transitions.
- [x] Delivery failure does not silently cancel a paid order without a refund workflow.
- [x] Delivery operations produce participant notifications and audit records.
- [x] No production marketplace seed/fake transaction data is committed.

## NEEDS HUMAN CONFIGURATION

### Supabase

**What:** Production Supabase project, Auth, database and Edge Functions.

**Why:** Repository CI cannot execute against a user's live database.

**Where:** Supabase project dashboard/tooling; apply `supabase/migrations/001_*.sql` through `032_*.sql` in order and deploy `supabase/functions/*`.

**How:** Configure the project URL/anon key for the app and server-only service-role key in the trusted Edge Function environment. Configure Auth providers and redirect URLs.

**Success:** Clean migration application succeeds, deployed functions are reachable, authenticated Customer A/B and Business A/B tests demonstrate isolation, and admin-only operations reject non-admin callers.

### Stripe

**What:** Stripe secret key, webhook secret and webhook endpoint.

**Why:** Payment creation and signed event processing require a real Stripe account.

**Where:** Supabase Edge Function secrets plus Stripe Dashboard webhook configuration.

**How:** Set server-only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; register the deployed checkout webhook endpoint. Keep only the publishable key in `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

**Success:** Test-mode checkout creates the intended order/payment, signed webhook finalizes it exactly once, and duplicate/failure events do not create duplicate transactions.

### Auth / deep links

**What:** Web and native password-recovery redirect configuration.

**Why:** Native deep-link behavior cannot be proven by source inspection.

**Where:** Supabase Auth URL configuration and the native app build using the `everestlocal://` scheme.

**How:** Register the web callback and native recovery URL, build the app, request password recovery and open the recovery link on physical iOS and Android devices.

**Success:** The recovery link opens the app, establishes the recovery session and permits password reset without exposing tokens to logs or UI state.

### AI (only if Ask Everest launches)

**What:** AI provider URL/model/key.

**Why:** Provider availability and latency are external runtime behavior.

**Where:** Supabase Edge Function environment.

**How:** Configure `AI_API_URL`, `AI_MODEL`, and `AI_API_KEY`. Do not expose the key to Expo.

**Success:** Authenticated requests return only permitted marketplace facts, timeouts fail safely, and no provider credential appears in client responses/logs.

### Notifications / delivery (only if enabled at launch)

**What:** Real push/email/SMS provider and delivery-driver/logistics setup.

**Why:** The repository contains application-side notification/delivery workflow but cannot provision external provider accounts or real drivers.

**Where:** Provider dashboard, Supabase environment and operational driver accounts.

**How:** Configure provider credentials/templates, real driver roles, dispatch procedures and any required mapping/logistics service.

**Success:** Important events notify the intended participant once, retries do not duplicate notifications, and a real delivery can move through every authorized state.

## NEEDS LIVE TESTING

### Database / RLS adversarial matrix

Run with five real test identities: Customer A, Customer B, Business A, Business B, Admin.

For each sensitive resource, test the applicable SELECT/INSERT/UPDATE/DELETE operations. Verify Customer A cannot read/write Customer B data; Business A cannot access Business B data; and non-admin users cannot invoke admin-only operations.

Resources: profiles, businesses, services, service requests, opportunities, quotes, conversations, messages, bookings, products, carts/cart items, orders, payments, reviews, deliveries, notifications and admin operations.

**Success:** unauthorized operations fail at the database boundary, even when requests are crafted outside the mobile UI.

### Stripe transaction matrix

Execute in Stripe test mode:

- successful payment
- duplicate webhook delivery
- invalid webhook signature
- payment retry
- checkout/payment expiry where applicable
- cancellation
- asynchronous payment failure
- webhook replay after successful processing
- concurrent checkout attempts
- cart modification during checkout

**Success:** one authoritative order/payment outcome per checkout, correct inventory reservation/release, and no client-controlled price/total/payment state.

### Native UX

Test physical iOS and Android devices for authentication, password recovery, keyboard behavior, safe areas, scrolling, back navigation, loading/error/empty states, network failure/retry and accessibility.

**Success:** no dead primary actions, unsafe transitions, duplicate submissions or unrecoverable error states in core flows.

### Production data / operations

Populate only real verified businesses, services and products through controlled onboarding/admin workflows.

**Success:** discovery, booking, product checkout and delivery operate using real records with no fake activity.

## NOT REQUIRED FOR CURRENT MVP

These are intentionally outside the current transactional MVP unless the launch plan explicitly requires them:

- Stripe Connect/KYC, marketplace transfers and payouts.
- Automated refund/dispute operations beyond the current payment-integrity safeguards.
- External maps/logistics/driver-dispatch integration.
- Full push/email/SMS provider infrastructure.
- Media/storage upload pipeline for business verification documents and marketplace media.
- Full background scheduler/queue infrastructure for expiry/re-matching.
- Advanced radius/distance/ranking search.
- Full moderation, disputes and suspicious-activity admin console.
- Dedicated hosted integration/E2E environment.

## CURRENT EVIDENCE BOUNDARY

**Verified by CI:** source type-checking, lint, static security/navigation audit, migration audit, repository security invariant tests, Expo Doctor, Expo web export and Edge Function type-checking.

**Verified by automated repository tests:** migration/RLS/search-path invariants and client-side authority/secret invariants covered by `npm run test:security`.

**Verified by live environment:** none from this repository audit. A real Supabase target, Stripe test account, native devices and optional external providers were not available to this engineering pass.

**Unverified / blocked:** live PostgreSQL migration execution, adversarial RLS, live Stripe lifecycle/webhooks, native deep links, AI provider runtime, external notification delivery and real driver/logistics operations.

Do not label the product fully production-ready until the required live checks above have passed.
