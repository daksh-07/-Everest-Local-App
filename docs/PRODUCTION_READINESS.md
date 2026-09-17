# Everest Local — Production Readiness / Current State

Audit date: 2026-09-18  
Repository: `daksh-07/-Everest-Local-App`  
Current audited head: `dae1c933cc93d5a9a99f517dc0dc77fa6dded6e3`

## Status definitions

- **VERIFIED** — actually executed successfully with current-repository evidence or against a real runtime.
- **PARTIALLY VERIFIED** — source and automated validation support the implementation, but live execution is still required.
- **UNVERIFIED** — the relevant runtime or behavior has not been executed.
- **MISSING** — required MVP capability does not exist or is materially incomplete.
- **BLOCKED BY HUMAN CONFIGURATION** — completion requires a real external account, secret, deployed backend, provider or physical device.

No fake businesses, products, reviews, orders, payments, availability or delivery records are included.

## 1. Current code gate

The latest pre-SDK-change CI run was GitHub Actions run `#175` / `35229556450` on commit `8bd5fc53e73b4a9bafe5d253098f359a57cef905` and passed the repository validation workflow.

The current head then aligned the mobile dependency set with Expo SDK 54. CI run `#176` / `35238239481` was still in progress at the time of this document update; therefore the SDK 54 dependency change is **PARTIALLY VERIFIED** until that run completes.

The workflow covers:

- dependency installation
- TypeScript
- ESLint
- static security/navigation audit
- migration audit
- security invariant tests
- Expo Doctor
- Expo web export
- Deno type-checking for all Edge Functions

The repository does not have a local reproducible full-install environment in this engineering session, so GitHub Actions is the authoritative code-validation evidence.

## 2. Repository architecture audit

### Implemented / source-verified

- Customer authentication/session foundation.
- Business onboarding and verification workflow.
- Service requests, deterministic matching, opportunities, quotes and quote acceptance.
- Participant-scoped messaging with server-authorized conversation creation and protected message mutation.
- Booking lifecycle and server-authorized state transitions.
- Review eligibility and duplicate-review constraints.
- Product management, publication controls and inventory authority.
- Persistent cart with atomic cart creation and direct cart-row authority hardening.
- Product checkout with server-authoritative price, inventory, business verification and fulfilment eligibility.
- Stripe Checkout creation and signed webhook finalization architecture.
- Order lifecycle authorization.
- Everest Delivery request, assignment, state transitions, audit and participant notification records.
- Account deletion Edge Function and in-app deletion entry point.
- Ask Everest authenticated Edge Function architecture.
- RLS and SECURITY DEFINER hardening across migrations 001–032.
- In-app privacy, terms and account-deletion informational routes.
- EAS preview/internal and production build profiles.

### Explicit boundaries

- No production marketplace seed/fake data.
- No Stripe Connect/KYC/payout/transfer system.
- No automatic refund/dispute workflow.
- No external maps/logistics/dispatch provider.
- No push/email/SMS provider delivery runtime.
- No storage/media upload pipeline for verification/media.
- No background scheduler/queue for expiry or re-matching.
- No full advanced radius/ranking search subsystem.
- No full moderation/disputes console.

These are not being treated as completed merely because adjacent architecture exists.

## 3. Database / Supabase

### Source/automated status

- Migration numbering 001–032: **VERIFIED by migration/security audits**.
- Public-table RLS coverage: **VERIFIED by repository security invariant test**.
- SECURITY DEFINER `search_path=public`: **VERIFIED by repository security invariant test**.
- Sensitive lifecycle authority: **VERIFIED by source audit/security invariants**.
- Cart creation concurrency: **VERIFIED by source and migration review**.
- Checkout item snapshot cleanup: **VERIFIED by source and migration review**.
- Product delivery checkout authority: **VERIFIED by source and migration review**.

### Live status

**BLOCKED BY HUMAN CONFIGURATION:** no production/staging Supabase target is configured for this audit. Therefore these have not been claimed as live-verified:

- clean migration application/reset;
- live PostgreSQL constraints/triggers/functions;
- adversarial Customer A/B and Business A/B RLS tests;
- Admin and Delivery Driver authorization tests;
- backup/restore and migration rollback rehearsal.

See `docs/SUPABASE_DEPLOYMENT.md` for the exact deployment and verification procedure.

## 4. Authentication

### Source status

Signup/login/logout/session handling, protected routes, password recovery configuration and account deletion are implemented. The app uses the `everestlocal` native scheme.

### Live status

**BLOCKED BY HUMAN CONFIGURATION:** real Supabase Auth configuration plus native builds/devices are required for signup, invalid credentials, session expiry, account switching, recovery-link handling and native deep-link verification.

The web and native redirect destinations must be registered in Supabase Auth before testing.

## 5. Service marketplace

**PARTIALLY VERIFIED:** the source implements request → matching → opportunity → quote → acceptance → booking → service deposit → webhook → completion → review, with business-side onboarding, verification, service areas, quotes, messaging and booking operations.

**BLOCKED BY HUMAN CONFIGURATION:** full two-customer/two-business E2E, live PostgreSQL execution, live Stripe service payment, invalid/duplicate transition testing and native interaction require a configured environment.

## 6. Product marketplace

**PARTIALLY VERIFIED:** the source implements product discovery/management, inventory controls, persistent carts, concurrency-safe cart creation, locked reservation, server-authoritative checkout, pickup/delivery selection, orders and delivery visibility.

**BLOCKED BY HUMAN CONFIGURATION:** live concurrent checkout, insufficient inventory, product-unavailable race, duplicate checkout, payment failure/expiry and webhook retry require a real database and Stripe test account.

## 7. Stripe

### Source status

**VERIFIED at source/CI level:**

- secret key and webhook secret are read only by Edge Functions;
- webhook signature verification is required;
- Stripe event IDs are claimed/idempotently finalized;
- order and service-payment flows are isolated by metadata and scoped idempotency;
- product totals are built from persisted order items, not client totals;
- service deposit amount is sourced from the authoritative booking/payment record.

### Live status

**BLOCKED BY HUMAN CONFIGURATION:** Stripe test-mode success, failure, expiry, duplicate webhook, retry, invalid signature, concurrent checkout and service-deposit transactions have not been run against a live Stripe account.

Refunds, disputes, Connect/KYC and payouts remain outside the current MVP.

## 8. Messaging / bookings / reviews

**PARTIALLY VERIFIED:** backend authorization/state-machine architecture exists and is covered by source/security checks.

**BLOCKED BY HUMAN CONFIGURATION:** participant isolation, duplicate operations, invalid transitions, network failure/retry and review eligibility must be exercised against a real database with separate identities.

## 9. Everest Delivery

**PARTIALLY VERIFIED:** `READY_FOR_PICKUP` → delivery request → admin driver assignment → pickup → in transit → delivered is implemented with cancellation/failure paths, audit records and participant notification records.

Paid orders are not silently cancelled when delivery fails; the code does not falsely claim a refund where no refund workflow exists.

**BLOCKED BY HUMAN CONFIGURATION:** real driver identities, deployed RLS/state transitions, physical/operational dispatch and notification delivery.

External maps/logistics integration is not implemented and is outside the core MVP.

## 10. Ask Everest

**PARTIALLY VERIFIED:** authentication, request length limits, server-only AI credentials, RLS-scoped marketplace retrieval and non-authoritative AI instructions are implemented.

**BLOCKED BY HUMAN CONFIGURATION:** provider availability, timeout behavior, malformed-provider response and production prompt/data evaluation require a real AI provider configuration.

## 11. Security

### Verified in source/CI

- No committed Stripe secret/private key literals detected by static audits.
- No TypeScript suppression directives accepted by the static audit.
- Sensitive payment/order/delivery mutations are not performed directly by client code.
- Authenticated profile role writes are blocked at client-code invariant level and protected server-side.
- SECURITY DEFINER functions are required to pin `search_path=public`.
- RLS is explicitly enabled on public tables detected by the security invariant test.
- Checkout client inputs do not include client-authoritative price/total/inventory/stock/tax/fee fields.
- Sensitive lifecycle state is server-authorized.
- Navigation references are checked against real Expo Router routes.

### Live security status

**BLOCKED BY HUMAN CONFIGURATION:** adversarial IDOR/RLS tests, direct-table mutation attempts and live role-boundary tests cannot be truthfully marked passed without a configured database and identities.

## 12. Native / store configuration

The app is now aligned to Expo SDK 54 dependency versions. Expo's SDK 54 reference specifies Android compile/target API 36, matching Google Play's requirement from 31 August 2026 for new apps and updates. This removes the earlier SDK 53/API 35 source-level store blocker, subject to the current CI/build validation completing successfully.

Physical iOS/Android builds, signing, deep links, recovery and store-console submission remain **BLOCKED BY HUMAN CONFIGURATION**.

`eas.json` provides internal preview and production profiles. Bundle/package IDs are configured as `com.everestlocal.app`; uniqueness and signing ownership must be confirmed in the Apple/Google developer accounts.

## 13. Privacy / deletion / legal surfaces

In-app Privacy Policy, Terms and account-deletion information are present, but they are not a substitute for final operator-approved legal text and public HTTPS pages.

**BLOCKED BY HUMAN CONFIGURATION:** public privacy URL, terms URL, support contact, external account-deletion web resource, Apple privacy disclosures, Google Play Data Safety declarations and final age/content declarations.

## 14. Notifications / observability

Server-side delivery notification records exist and are authorized. Actual push/email/SMS delivery is **BLOCKED BY HUMAN CONFIGURATION** because no provider is configured.

Dedicated client crash reporting/centralized production alerting is **MISSING** from the repository. Supabase/Edge Function logs are available as an operational primitive, but they are not equivalent to complete client crash/alert coverage.

A private beta can operate with explicit operational monitoring and support procedures; public launch should add privacy-safe crash/error monitoring and payment/webhook alerting before broad distribution.

## 15. Controlled marketplace seeding

No fake data is present. Real Western Sydney businesses, services, products, service areas and prices must be entered through the existing controlled onboarding/admin workflows after the live environment is configured.

Status: **BLOCKED BY HUMAN CONFIGURATION**.

## 16. Performance / UX

Source review confirms bounded marketplace queries, debounced search, loading/error/empty handling in core transactional screens, server-side checkout calculation and indexed transactional paths.

**UNVERIFIED:** physical keyboard behavior, accessibility, offline/reconnect, slow-network behavior and repeated-tap behavior on real devices. These require device/runtime testing rather than speculative source rewrites.

## 17. Final launch assessment

The repository is **not yet externally validated production-ready**. The codebase has a strong source/CI gate, but the critical remaining evidence is environmental: live Supabase, Stripe test transactions/webhooks, native devices, Auth redirects, real identities and any enabled providers.

The correct launch sequence is:

1. complete SDK 54 CI validation;
2. configure staging Supabase and apply migrations cleanly;
3. run adversarial RLS/state-machine matrix;
4. configure Stripe test mode and execute the payment matrix;
5. configure Auth redirects and execute native recovery/deep-link tests;
6. build preview iOS/Android and test core customer/business flows;
7. configure optional AI/notification/delivery providers if included in beta scope;
8. onboard only real verified marketplace participants;
9. operate a controlled private beta with monitoring/support;
10. complete store/legal/configuration gates before public submission.

See `docs/FINAL_LAUNCH_GATE.md` for the binary release gate.
