# Everest Local — Production Readiness + Real Backend Verification

Audit date: 2026-09-17
Repository: `daksh-07/-Everest-Local-App`

## Verification standard

- **VERIFIED** — source and/or CI evidence directly proves the behavior.
- **PARTIALLY VERIFIED** — meaningful implementation exists, but part of the flow remains incomplete or unexecuted.
- **UNVERIFIED** — source exists but the real configured backend/provider/device flow has not been executed here.
- **BROKEN** — known correctness/security failure remains.
- **MISSING** — required capability is not implemented.
- **BLOCKED BY HUMAN CONFIGURATION** — code can be prepared, but an external account/secret/provider/action is required.

No fake businesses, products, reviews, orders, payments, availability or delivery records are used.

## 1. VERIFIED WORKING

### Foundation / CI
**VERIFIED.** Expo Router, TypeScript, ESLint, static security/navigation audit, Expo Doctor, Expo web export and Supabase Edge Function type-checking are covered by GitHub Actions. The CI workflow was not modified during this engineering cycle.

### Customer marketplace foundation
**PARTIALLY VERIFIED.** Customer request creation, deterministic matching, opportunities, quotes, quote acceptance and booking creation use authenticated Supabase/RPC paths with server-side ownership/eligibility checks. Real target-project execution remains unverified.

### Business marketplace foundation
**PARTIALLY VERIFIED.** Business creation, verification state, services, service areas, opportunities, quotes, products and inventory use controlled backend operations. Live multi-business isolation remains unverified.

### Product checkout
**PARTIALLY VERIFIED.** Cart → transactional order → locked inventory reservation → server-created Stripe Checkout → signed/idempotent webhook → atomic payment/order/inventory processing is implemented. Live Stripe execution remains unverified.

### Messaging
**PARTIALLY VERIFIED.** Conversation discovery, participant-scoped thread reads, sending, unread/read handling and the thread/composer UI are implemented. Client message update/delete is blocked. Live participant-isolation testing remains unverified.

### Reviews
**PARTIALLY VERIFIED.** Transaction eligibility is enforced by `create_transaction_review`; the app now exposes completed service/product transactions as review targets and submits verified reviews. Live database execution remains unverified.

### AI
**PARTIALLY VERIFIED.** Ask Everest uses server-side AI configuration, bounded input and marketplace context restricted to active/verified public records. Provider execution is unverified.

### Delivery
**PARTIALLY VERIFIED.** Delivery schema, assignment authorization, transition validation and order synchronization exist. No external logistics/driver operation is verified.

## 2. PARTIALLY VERIFIED

| Area | Status | Evidence / limitation |
|---|---|---|
| Authentication | PARTIALLY VERIFIED | Supabase signup/signin/signout/reset/session persistence exist; centralized route guards are now present. Live session/deep-link/device testing remains. |
| Customer request → quote → booking | PARTIALLY VERIFIED | Authenticated RPC path exists; live E2E not executed. |
| Matching | PARTIALLY VERIFIED | Server-side deterministic matching exists; expiry/re-match scheduler is missing. |
| Quote lifecycle | PARTIALLY VERIFIED | Send/accept paths exist; complete declined/viewed/expired/cancelled UX is incomplete. |
| Service payment | PARTIALLY VERIFIED | Booking deposit Stripe Checkout, atomic success/failure ledger and webhook handling are now implemented; live Stripe verification remains. |
| Messaging | PARTIALLY VERIFIED | Full thread/composer UI and secure participant writes now exist; live isolation testing remains. |
| Reviews | PARTIALLY VERIFIED | Review UI and transaction-bound RPC now exist; live execution remains. |
| Product management | PARTIALLY VERIFIED | Create/edit/pause/publish/archive/inventory controls exist; media and delivery configuration remain. |
| Product checkout | PARTIALLY VERIFIED | Pickup-only checkout is live in code; delivery method/address/fees are not wired. |
| Business verification | PARTIALLY VERIFIED | Admin-controlled verification exists; verification document upload/storage is missing. |
| Notifications | PARTIALLY VERIFIED | In-app records/triggers/read RPC exist; push/email/SMS providers are not configured. |
| Delivery operations | PARTIALLY VERIFIED | Secure status RPC exists; creation/assignment/driver UI and external logistics are incomplete. |
| Admin | PARTIALLY VERIFIED | Admin verification/operations dashboard exists; broader marketplace moderation/management UI is limited. |

## 3. UNVERIFIED

- Live Supabase migrations and PostgreSQL runtime behavior against the target project.
- Adversarial RLS tests using separate customer/customer, business/business, admin and driver accounts.
- Full real customer service journey.
- Full real business journey.
- Real concurrent inventory checkout.
- Stripe test-mode checkout, webhook delivery, retry, expiry, cancellation and failure execution.
- Service deposit payment against Stripe test mode.
- Native iOS/Android release builds and physical devices.
- AI provider execution and data-boundary tests.
- Production push/email/SMS delivery.
- Real delivery dispatch/driver operation.

## 4. BROKEN / CORRECTNESS ISSUES FOUND AND FIXED

### Fixed

1. Profile role escalation via client profile insert/delete was closed.
2. Direct business creation bypass was closed in favor of the controlled RPC.
3. Direct business verification insertion was closed.
4. Participant message mutation was closed; messages are immutable to clients.
5. Existing Stripe Checkout session retrieval no longer releases a reservation incorrectly.
6. Stripe Checkout expiry, cancellation and async payment failure now release product reservations through trusted processing.
7. Async Stripe Checkout sessions are not treated as paid before settlement.
8. Notification read state uses a narrow authorized RPC instead of reopening notification writes.
9. Authenticated route guards now protect customer, business, admin and delivery routes.
10. Service booking deposits now have a dedicated server-authoritative payment ledger and Stripe Checkout/webhook path.
11. Service payment provider creation uses a stable payment identifier as the Stripe idempotency key to converge concurrent callers.
12. Product checkout now serializes pending checkout attempts per customer cart, preventing independent concurrent orders from the same cart.
13. Product management now supports secure edit/archive operations through an authorized RPC.
14. Transaction review UI now exposes only completed booking/product-purchase targets and calls the existing eligibility-enforcing RPC.

## 5. MISSING

- Delivery selection/address/fee calculation in product checkout.
- Verification-document and marketplace media upload/storage.
- Push/email/SMS notification providers.
- Background scheduler/queue for quote/opportunity expiry and re-matching.
- Full Stripe Connect onboarding/KYC, provider payouts, transfers/platform fees, refunds and disputes.
- Complete delivery creation/assignment/driver operations UI and external logistics integration.
- Production monitoring/error tracking/alerting.
- Broader admin marketplace moderation/operations surfaces where required by launch scope.

## 6. SECURITY FINDINGS

**VERIFIED in source:** sensitive lifecycle writes are routed through controlled RPCs; profile roles are not client-writable; verification approval is admin-authorized; order/payment state is server-authoritative; Stripe signatures and idempotency are enforced; message mutation is blocked; AI has no privileged mutation tool; business/customer access is ownership/member scoped.

**UNVERIFIED:** these RLS claims still require live adversarial testing against the deployed PostgreSQL schema. Source review cannot prove runtime policy behavior.

## 7. DATABASE / RLS FINDINGS

- Core marketplace tables use RLS.
- Customer records are scoped to `auth.uid()`.
- Business records use business-membership authorization.
- Sensitive lifecycle operations use SECURITY DEFINER RPCs with explicit authorization.
- Review creation requires completed eligible transactions and unique constraints prevent duplicate eligible reviews.
- Delivery transitions are server-authorized.
- Product inventory is lock-based and finalized atomically.
- Cart checkout now has a database-level active-checkout claim.
- SQL migrations have been source-reviewed but not executed against the real target project in this environment.

## 8. STRIPE FINDINGS

**VERIFIED in code:** server-only secret usage, authoritative DB pricing, Stripe Checkout, webhook signature verification, durable event claiming, idempotent provider calls, atomic product order payment/inventory processing, cancellation/expiry/failure handling, and service deposit payment processing.

**UNVERIFIED:** real Stripe test-mode execution, webhook registration, webhook retries, provider behavior and production account configuration.

**MISSING:** Stripe Connect provider onboarding/KYC/payouts/transfers/platform fees/refunds/disputes.

## 9. AI FINDINGS

**VERIFIED in code:** AI URL/model/key are server-side configuration; user input is bounded; marketplace context is read through authenticated Supabase access; the AI has no direct privileged mutation path; prompts prohibit fabricated marketplace facts.

**UNVERIFIED:** real provider execution, rate-limit behavior and production monitoring.

## 10. DELIVERY FINDINGS

**VERIFIED in code:** delivery status enum, transition validation, assignment authorization and order synchronization.

**PARTIALLY VERIFIED:** app operations for creation/assignment/driver workflow are incomplete.

**BLOCKED BY HUMAN CONFIGURATION:** real logistics provider/driver infrastructure is not configured or tested.

## 11. REQUIRED ENVIRONMENT VARIABLES

### Public mobile bundle

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_APP_ENV`

### Trusted server / Supabase Edge Functions — never bundle

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AI_API_URL`
- `AI_MODEL`
- `AI_API_KEY`
- Storage/notification configuration when those providers are implemented.

The repository `.env.example` separates public and trusted configuration.

## 12. REQUIRED EXTERNAL SERVICES

- Supabase production/staging project with all migrations applied.
- Supabase Auth configuration.
- Stripe test/live account and registered webhook.
- AI provider, if Ask Everest is enabled at launch.
- Storage provider/Supabase Storage for required uploads.
- Push/email/SMS providers if those channels are launch scope.
- Delivery/logistics infrastructure if delivery is launch scope.
- Production monitoring/error tracking/alerting.
- Apple Developer and Google Play accounts for native release.

## 13. REQUIRED MANUAL DEVICE TESTS

1. Fresh iOS install: signup, verification, login, logout, reset.
2. Fresh Android install: same flow.
3. Kill/reopen and session restoration.
4. Expired session and protected-route recovery.
5. Customer request → matching → quote → acceptance → booking.
6. Business A vs Business B isolation.
7. Customer A vs Customer B isolation.
8. Non-admin vs admin authorization.
9. Product create/edit/publish/archive/inventory exhaustion.
10. Two concurrent purchases of the final unit.
11. Product Stripe success/failure/cancel/expiry/retry.
12. Service deposit Stripe success/failure/cancel/expiry/retry.
13. Duplicate webhook delivery.
14. Existing Checkout Session recovery.
15. Messaging participant isolation and immutable messages.
16. Verified review eligibility and duplicate rejection.
17. Delivery authorization and state transitions.
18. Keyboard, safe areas, scrolling, small/large phones and network failures.

## 14. BLOCKERS TO REAL LAUNCH

1. **Live backend verification** — BLOCKED BY HUMAN CONFIGURATION until a target Supabase environment and test accounts are available.
2. **Stripe E2E verification** — BLOCKED BY HUMAN CONFIGURATION until the webhook is registered and Stripe test mode is available.
3. **Native physical-device release validation** — BLOCKED BY HUMAN CONFIGURATION until iOS/Android build/signing environments are available.
4. **Delivery operations** — BLOCKED BY HUMAN CONFIGURATION if delivery is part of launch scope.
5. **Verification/media uploads** — MISSING if required at launch.
6. **Push/email/SMS** — MISSING if required at launch.
7. **Stripe Connect** — MISSING if marketplace provider payouts are part of launch scope.
8. **Production monitoring/alerting** — MISSING.

## Current release assessment

**NOT launch-ready.** The application has a substantially hardened source foundation and a green CI baseline, and this cycle completed service-payment code, review UI, authenticated route guards, product editing/archiving and cart checkout serialization. The remaining gap is real environment execution plus the explicitly incomplete marketplace infrastructure above.

## Engineering commits in this autonomous cycle

- `ec28ab306cacb9024c1d810aaf5e6ab767ea60b5` — service payment ledger/RPCs
- `6b6037029ab254e9a89de5e332b7286158a89161` — service payment webhook handling
- `cf696555edd7d007ce48ccc40476f219483d0bb5` — service payment client helper
- `8b887782b37e619bac752031d263332b4f7a0e42` — booking deposit UI
- `2db11299c703443ee430db5b1688084fbfca0420` — transaction review workflow
- `99dbc924c92ca8ef2f297ce47cd84027ce59714a` — review UI
- `2e9f7ffcc4d85451790772c644d3353514ec58b8` — account review navigation
- `91c84b1b3b0ccfabca0566fcc167dd1cc485a4a4` — cart checkout serialization
- `2cd14cb8f153616fd48fa65a49e48ed986a47abf` — service provider idempotency
- `e344b2d681f39b7c1fc734ee805eea35802860c3` — authenticated route guards
- `fe46e399261d9a0ffb0fcdae1bdf8af837ef66e1` — secure product editing RPC
- `bc335135d3a6069bbca0ac2e81cb5bab2fb99e94` — product editing client helper
- `6691133de09b9e08039311b191d0312c031450d6` — product edit/archive UI

The report is intentionally conservative: source/CI evidence is not represented as real-world verification.
