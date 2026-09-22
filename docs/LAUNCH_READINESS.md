> Current audit: [22 September 2026 beta readiness](BETA_READINESS_2026-09-22.md). The run #182 / initial-empty-project details below are historical. Do not use them to reset or blindly redeploy the current database.

# Everest Local — Current Launch Readiness Audit

**Audit date:** 2026-09-18  
**Audited code head:** `564e4094615cb59a9277d2acad459ff235acdf29`  
**Latest full CI evidence:** run `#182` / `35239201981` — PASS  
**Current release-document commit:** subsequent docs-only commit after the audited code head; no application code changed.

## Executive status

**Source/CI:** VERIFIED.  
**External runtime:** BLOCKED BY HUMAN CONFIGURATION.  
**Public launch:** NOT READY.  
**Controlled private beta:** possible only after the external staging gate below is completed.

No fake businesses, products, reviews, orders, payments, availability or delivery records were created.

## 1. What is implemented

### Customer

- authentication/session foundation;
- service request creation;
- deterministic matching and opportunities;
- quote viewing/acceptance;
- participant messaging;
- bookings and review flow;
- product discovery;
- persistent cart;
- pickup/delivery checkout;
- orders and delivery visibility;
- Ask Everest UI;
- account deletion entry point.

### Business

- business creation/onboarding;
- verification workflow;
- service management;
- service areas;
- opportunity/quote operations;
- business messaging;
- booking operations;
- product management;
- inventory management;
- customer order visibility;
- delivery request workflow.

### Backend/security

- 32 ordered Supabase migrations;
- RLS and server-authorized RPC boundaries;
- SECURITY DEFINER `search_path=public` hardening;
- server-authoritative checkout pricing/inventory/publication/fulfilment;
- cart concurrency protection;
- checkout item snapshots;
- Stripe webhook signature/idempotency architecture;
- delivery authorization/state machine/audit records;
- account deletion Edge Function;
- AI provider server-side architecture;
- static secret/navigation audit;
- security invariant tests;
- CI TypeScript, ESLint, Expo Doctor, web export and Edge Function type checks.

## 2. What is VERIFIED

Run #182 verified on the current application code:

- npm dependency installation;
- TypeScript;
- ESLint;
- static security/navigation audit;
- migration audit 001–032;
- 11 repository security/native configuration invariant tests;
- Expo Doctor with Expo SDK 54 dependency alignment;
- Expo web export;
- all Supabase Edge Function type checks.

The current package set is aligned to Expo SDK 54. SDK 54 targets Android API 36, satisfying the current Google Play target API requirement at the source/build-configuration level. A native release build is still required before store submission.

## 3. What is source-verified but not live-verified

- RLS ownership and participant policy architecture.
- Booking/order/delivery state-machine authorization.
- Server-only Stripe and AI credentials.
- Stripe signature/idempotency architecture.
- Product price/inventory authority.
- Cart ownership/concurrency safeguards.
- Delivery paid-order integrity.
- Messaging authorization boundaries.
- Review eligibility/duplicate constraints.
- Account deletion authorization path.

These are not being upgraded to `VERIFIED` until exercised against the real deployed services.

## 4. What is BLOCKED BY HUMAN CONFIGURATION

### Supabase

A real staging/production project is required to:

- apply migrations from a clean state;
- validate PostgreSQL constraints/functions/triggers;
- run Customer A/B and Business A/B adversarial RLS tests;
- test Admin and Delivery Driver authorization;
- test direct-table mutation attempts outside the UI.

### Stripe

A Stripe test account, deployed webhook endpoint and signing secret are required to execute:

- successful payment;
- failed payment;
- expiry;
- duplicate webhook;
- webhook retry;
- invalid signature;
- concurrent checkout;
- inventory race;
- service deposit payment.

### Authentication / devices

A configured Supabase Auth environment plus physical iOS/Android builds are required to verify:

- registration/login/logout;
- session persistence/expiry;
- password recovery;
- `everestlocal://` recovery deep link;
- web recovery redirect;
- account switching;
- keyboard/safe-area/accessibility behavior.

### Optional providers

If included in the launch scope, real AI, notification and delivery/logistics providers must be configured and tested. No provider delivery is being claimed without that runtime evidence.

## 5. Missing functionality / explicit MVP boundaries

These are not required for the core transactional MVP unless the launch scope changes:

- Stripe Connect/KYC/marketplace payouts/transfers;
- automatic refunds/disputes;
- external maps/logistics/driver dispatch;
- push/email/SMS delivery infrastructure;
- storage/media upload pipeline;
- background scheduler/queue;
- advanced radius/ranking search;
- full moderation/disputes console;
- hosted integration/E2E environment;
- dedicated client crash-reporting/centralized alerting layer.

The last item is the main **MISSING** operational capability rather than an external test blocker. Supabase/Edge Function logs remain available, but broad public launch should add privacy-safe client crash/error monitoring and payment/webhook alerting.

## 6. Exact launch blockers

1. No live Supabase environment has been supplied for migration/RLS validation.
2. No live Stripe test environment has been supplied for payment/webhook validation.
3. Native physical-device testing has not been executed.
4. Supabase Auth redirect/deep-link behavior is therefore unverified.
5. Real businesses/catalog/pricing data have not been seeded because the app correctly contains no fake data.
6. Public privacy/terms/support/account-deletion URLs and store declarations require operator configuration.
7. Production monitoring/alerting is not configured.
8. Optional AI/notification/delivery provider behavior is unverified until configured.

## 7. Required human actions, in order

1. Create staging Supabase project and configure Auth.
2. Apply migrations 001–032 from a clean state.
3. Deploy the five Edge Functions and configure trusted secrets.
4. Run the complete adversarial RLS/authorization matrix.
5. Configure Stripe test mode/webhook and run the payment matrix.
6. Configure Auth web/native redirects.
7. Create EAS internal preview builds and test on physical iOS and Android devices.
8. Configure only the optional providers required for the private beta.
9. Onboard real verified Western Sydney businesses/services/products.
10. Run controlled beta with support and operational monitoring.
11. Finalize legal/store configuration and complete the final launch gate before public submission.

Detailed Supabase procedure: `docs/SUPABASE_DEPLOYMENT.md`.  
Binary release gate: `docs/FINAL_LAUNCH_GATE.md`.

## 8. Post-MVP work that should NOT block the core launch

Do not delay the transactional MVP for Stripe Connect, sophisticated marketplace payouts, advanced discovery ranking, external logistics, a full moderation suite, large-scale automation queues or broad media infrastructure unless the business model explicitly requires them for day-one operations.

The next engineering work should be driven by failures discovered in the real staging environment, not by feature-count expansion.
