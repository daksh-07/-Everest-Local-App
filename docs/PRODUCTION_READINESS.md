# Everest Local — Production Readiness + Real Backend Verification

Audit date: 2026-09-17  
Repository: `daksh-07/-Everest-Local-App`  
Audit head before this report: `d7996a384a3f6e058bf014bfd1852530e0052aed`

## Verification standard

Every capability is classified separately as:

- **CODE EXISTS** — implementation is present in the repository.
- **BACKEND CONNECTED** — the code calls the intended Supabase/Stripe/AI backend path and has authorization/error handling visible in source.
- **REAL-WORLD VERIFIED** — the complete flow has been executed against a real configured backend/provider with real test accounts/data. This audit did not have a configured target Supabase project, Stripe webhook delivery environment, AI provider, or native device lab, so those claims remain unverified.

No fake marketplace businesses, products, orders, reviews, availability, payments, or delivery records were added.

## 1. VERIFIED WORKING

### CI / static validation
- **CODE EXISTS / REAL CI VERIFIED:** GitHub Actions validates TypeScript, ESLint, the static security/navigation audit, Expo Doctor, Expo web export, and Supabase Edge Function type-checking.
- The latest pre-audit baseline run #84 was green. A later Phase 1 run #94 was also green before the follow-up fixes in this audit.
- CI is evidence of source/build health only; it is not evidence that a live Supabase/Stripe integration works end-to-end.

### Customer request and matching foundation
- **CODE EXISTS:** Customer request screen, request listing, matching RPC, matches, opportunities, quotes, quote acceptance and bookings are implemented.
- **BACKEND CONNECTED:** Request creation uses the authenticated Supabase RPC; matching derives `auth.uid()` server-side and restricts matches to active, verified businesses serving the requested suburb.
- **REAL-WORLD VERIFIED:** Not executed against a live target project.

### Business/catalog foundation
- **CODE EXISTS:** Business creation, verification submission, services, service areas, products, inventory, opportunities and business orders are implemented.
- **BACKEND CONNECTED:** Business/service/product lifecycle writes use authorized RPCs; publication is verification-gated; inventory is lock-based.
- **REAL-WORLD VERIFIED:** Not executed against live customer/business/admin accounts.

### Product checkout foundation
- **CODE EXISTS:** Cart, transactional order creation, inventory reservation, Stripe Checkout creation and webhook processing exist.
- **BACKEND CONNECTED:** Checkout derives product names/prices/quantities from database order items, uses a server-side Stripe secret, and uses idempotency keys. Webhook signatures are verified.
- **REAL-WORLD VERIFIED:** Not executed against live Supabase + Stripe test mode.

### AI foundation
- **CODE EXISTS:** Ask Everest UI and server Edge Function exist.
- **BACKEND CONNECTED:** AI credentials are server-only; marketplace context is read through an authenticated Supabase client and limited to public active/verified records; the system prompt explicitly prohibits fabricated marketplace facts and privileged mutations.
- **REAL-WORLD VERIFIED:** AI provider execution is not configured/verified in this environment.

### Delivery foundation
- **CODE EXISTS:** Delivery records, assignment schema and controlled status transition RPC exist.
- **BACKEND CONNECTED:** Delivery status changes require admin or assigned-driver authorization and synchronize relevant order states.
- **REAL-WORLD VERIFIED:** No real delivery operator/driver environment has been configured or exercised.

## 2. PARTIALLY IMPLEMENTED

| Area | Code exists | Backend connected | Real-world verified | Limitation |
|---|---|---|---|---|
| Authentication | Yes | Yes, Supabase Auth | No | Signup/login/logout/reset exist; centralized route/session guard is not implemented. |
| Customer request → quote → booking | Yes | Yes | No | End-to-end target-project execution remains unverified. |
| Deterministic matching | Yes | Yes | No | No production scheduler/queue for expiry/re-matching. |
| Quote lifecycle | Yes | Yes | No | Sent/accept path exists; viewed/declined/expired/cancelled UX is incomplete. |
| Service payment | Partial | Partial | No | Deposit can create `PENDING_PAYMENT`, but there is no service-specific Stripe checkout/webhook path. Non-admin callers cannot falsely confirm unpaid bookings. |
| Messaging | Partial | Yes for existing records | No | Conversation/message schema and participant RLS exist, but complete conversation creation and thread/composer UI are missing. |
| Reviews | Partial | Yes | No | Verified-transaction review RPC exists; creation/display UI is missing. |
| Product marketplace | Yes | Yes | No | Current checkout is pickup-only; delivery selection/address/fees are not wired into checkout. |
| Delivery operations | Partial | Yes | No | Delivery creation/assignment/driver workflow is not fully wired into the app. |
| Business verification | Yes | Yes | No | Admin-controlled verification exists; document upload/storage is not implemented. |
| Notifications | Yes | Yes for in-app records | No | Database triggers exist; push/email/SMS providers are not configured. |
| Account deletion | Yes | Yes | No | Hard delete is intentionally blocked when retained marketplace/audit records require support closure. |
| Geographic coverage | Partial | Yes | No | Several screens still default to Sydney/NSW despite scalable location fields in the schema. |

## 3. UNVERIFIED

- Live Supabase migrations applied successfully to the target production project.
- Live RLS isolation tests using two customers, two businesses, an admin and a delivery driver.
- Real customer request → matching → quote → booking execution.
- Real Stripe Checkout payment, webhook delivery, retries, failure, cancellation and expiry.
- Concurrent real checkout attempts against the same inventory.
- Native iOS and Android builds on physical devices.
- Supabase Storage upload/policy behavior because storage is not yet implemented.
- AI provider execution and prompt/data-boundary validation.
- Production push/email/SMS delivery.
- Operational delivery assignment/driver execution.

## 4. BROKEN / CORRECTNESS ISSUES FOUND AND FIXED

### Fixed during this audit

1. **Profile role escalation path:** client `profiles` insert/delete access was not revoked. Because role is stored on the profile and `is_admin()` relies on that row, deleting a profile and recreating it with an elevated role was an avoidable privilege-escalation path. Migration `018_security_integrity_followup.sql` revokes client profile insert/delete.
2. **Uncontrolled business creation:** the `businesses` table retained a direct client insert policy even though a controlled `create_business_profile` RPC exists. Migration 018 revokes direct client business inserts so registration goes through the controlled path.
3. **Uncontrolled verification records:** direct client insertion into `business_verifications` was possible. Migration 018 revokes client inserts so submissions use the controlled verification RPC.
4. **Message mutation:** the original `messages_participant` `FOR ALL` policy allowed a participant to update/delete messages, including changing another sender's message while satisfying the update check with their own `sender_id`. Migration 018 replaces it with participant-scoped SELECT/INSERT policies and revokes client UPDATE/DELETE.
5. **Existing Stripe session retrieval:** if a persisted Stripe Checkout Session existed but Stripe retrieval temporarily failed, the checkout catch path could release the reservation because the session-created flag was still false. The checkout function now marks an existing provider session as accepted before retrieval, retaining the reservation for webhook completion/recovery.
6. **Abandoned/async Stripe payments:** the webhook previously handled payment success/failure but not Checkout Session expiry or async payment failure/cancellation. It now processes `checkout.session.expired`, `checkout.session.async_payment_failed`, and `payment_intent.canceled` through the same atomic reservation-release path.
7. **Async Checkout completion:** `checkout.session.completed` is no longer treated as paid unless Stripe reports `payment_status='paid'`; deferred settlement can complete through `payment_intent.succeeded`.

### Not treated as broken

- Missing service-payment, messaging thread, reviews UI, delivery operations, storage, notification channels, route guards, schedulers and Connect are documented as missing/partial scope rather than hidden behind fake implementations.

## 5. MISSING

- Service-specific Stripe payment flow for deposits/full service bookings.
- Complete customer conversation creation + message thread/composer UI.
- Review creation and review display UI.
- Customer delivery method/address/fee selection and delivery checkout integration.
- Delivery creation, assignment and driver workflow UI/operations.
- Verification-document and marketplace media upload via controlled Supabase Storage.
- Push/email/SMS notification providers.
- Centralized authenticated route/session guard and explicit auth deep-link recovery.
- Background job/scheduler for opportunity/quote expiry and other scheduled marketplace work.
- Stripe Connect onboarding/KYC, provider payouts, platform fees/transfers, refunds and disputes.
- Live integration tests against the target Supabase project and Stripe test webhooks.
- Native iOS/Android release builds and physical-device validation.
- Production monitoring, error tracking and operational alerting.

## 6. SECURITY FINDINGS

### Hardened

- Client writes to sensitive service/product/quote/opportunity lifecycle tables are revoked; controlled RPCs remain the write path.
- Client notification writes are revoked.
- Product image public visibility follows active + verified business visibility.
- Product publication requires verified business and available inventory.
- Inventory reactivation checks business verification.
- `PENDING_PAYMENT` bookings cannot be confirmed by normal customer/business callers.
- Stripe success/failure inventory/payment processing is atomic and server-authorized.
- Stripe event claims are durable and recover stale/failed processing states.
- PaymentIntent and Checkout Session metadata carry the internal order identity.
- Account deletion performs a database preflight before Auth deletion.
- Profile role mutation is not client-writable through normal table operations.
- Message updates/deletes are blocked for clients.

### Remaining security verification

RLS is source-reviewed but not live-executed here. A production launch requires adversarial tests proving customer/business/admin/driver isolation against the actual deployed schema.

## 7. DATABASE / RLS FINDINGS

- Core tables use RLS.
- Customer private records are scoped by authenticated user ID.
- Business records are scoped through `is_business_member()`.
- Public discovery is restricted to active/verified marketplace records where applicable.
- Sensitive lifecycle writes use SECURITY DEFINER functions with explicit authorization checks.
- Transaction/order/payment state is not intended to be client-writable.
- Review eligibility is tied to completed bookings or completed product orders in the review RPC.
- Delivery assignment reads are scoped to the assigned driver/admin.
- SQL migrations are source-reviewed in this audit but have **not** been executed against a live Supabase database in this environment. GitHub CI Deno type-checking does not validate PostgreSQL runtime semantics.

## 8. STRIPE FINDINGS

### Implemented

- Server-only Stripe secret usage.
- Stripe Checkout Session creation from authoritative DB order items.
- Idempotency key requirement and persistence.
- Provider Checkout Session ID persistence.
- Stripe webhook signature verification.
- Durable event claim/finish state.
- Atomic order/payment/inventory success processing.
- Atomic failed/expired/cancelled reservation release.
- PaymentIntent metadata containing order identity.

### Remaining

- Live Stripe test-mode execution is unverified.
- Webhook endpoint must be registered against the actual deployed Supabase Edge Function.
- Service payments are not implemented.
- Stripe Connect provider onboarding/payouts/platform fee/refund/dispute flows are not implemented.

## 9. AI FINDINGS

- AI API URL/key/model are server-side configuration.
- User message is validated to a bounded 2,000-character string before provider submission.
- Marketplace context is read through authenticated Supabase access and is limited to public active/verified business/product fields.
- The AI function exposes no privileged mutation tool.
- The prompt instructs the model not to invent businesses, products, prices, reviews, availability, delivery times or customer data.
- Provider timeout/rate-limit/retry policy and production monitoring are not implemented beyond safe generic error handling.
- Real provider execution is unverified.

## 10. DELIVERY FINDINGS

### Code implemented

- Delivery schema.
- Unique order-to-delivery relationship.
- Delivery status enum and transition validation.
- Admin/assigned-driver authorization.
- Order synchronization for ready/out-for-delivery/delivered/cancelled states.

### Operationally configured

- **Not verified/configured in this environment.** There is no verified external logistics provider, driver dispatch, assignment workflow, GPS/tracking integration, or delivery operations test environment.

## 11. REQUIRED ENVIRONMENT VARIABLES

### Public mobile bundle

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (configuration contract; product checkout is created server-side)
- `EXPO_PUBLIC_APP_ENV`

### Trusted server / Supabase Edge Functions — never bundle

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AI_API_URL`
- `AI_MODEL`
- `AI_API_KEY`
- `STORAGE_CONFIG` when storage is implemented
- `NOTIFICATION_CONFIG` when notification channels are implemented

`.env.example` keeps the public and trusted groups separate.

## 12. REQUIRED EXTERNAL SERVICES

- Supabase production project with migrations applied and Auth configured.
- Stripe account in test mode for end-to-end validation, then live mode after sign-off.
- Stripe webhook endpoint targeting the deployed `stripe-webhook` Edge Function.
- AI provider compatible with the configured `AI_API_URL` contract, if Ask Everest is enabled.
- Supabase Storage for verification/media uploads if those workflows are launch scope.
- Push/email/SMS provider(s) if off-app notifications are launch scope.
- Delivery/logistics infrastructure if Everest Delivery is launch scope.
- Production monitoring/error tracking/alerting.

## 13. REQUIRED MANUAL DEVICE TESTS

1. Fresh iOS install → signup → email verification → login.
2. Fresh Android install → same auth flow.
3. Kill/reopen → session persists correctly.
4. Expired/invalid session → protected operations fail safely and recovery works.
5. Customer request → deterministic matching → business opportunity → quote → customer acceptance → booking.
6. Business A cannot read/write Business B private opportunities, orders, products, inventory or verification records.
7. Customer A cannot read Customer B requests, orders, messages or payment records.
8. Non-admin cannot approve business verification or execute admin RPCs.
9. Product create → verify business → publish → inventory changes → stock exhaustion.
10. Two concurrent checkouts for the final unit: only one reserves it successfully.
11. Stripe successful checkout → signed webhook → payment/order success → inventory decrement.
12. Stripe failed payment → reservation release → no false paid state.
13. Stripe cancelled/expired checkout → reservation release.
14. Duplicate webhook delivery → no duplicate order/payment/inventory effect.
15. Existing Checkout Session retrieval failure → reservation remains until provider outcome is known.
16. Stripe success/cancel deep links and auth recovery links.
17. Quote expiry and any scheduled job behavior once scheduler exists.
18. Messaging participant isolation and immutable message behavior.
19. Review eligibility and duplicate-review rejection.
20. Delivery assignment/status authorization and order synchronization.
21. Keyboard, safe areas, small/large phones, scrolling, offline/network errors and accessibility.

## 14. BLOCKERS TO REAL LAUNCH

Everest Local is **not launch-ready yet**.

The primary blockers are:

1. **Live Supabase backend verification:** apply all migrations to the actual target project and run RLS/RPC integration tests with separate customer/business/admin/driver accounts.
2. **Stripe end-to-end verification:** register the webhook, run test payments/failures/cancellations/expiry/retries, and verify inventory/order/payment state in the real database.
3. **Service payments:** complete and verify the service booking payment path if paid service bookings are in launch scope.
4. **Messaging/reviews:** complete the existing UI flows if they are launch-critical.
5. **Delivery:** configure and verify real delivery operations if offered at launch.
6. **Storage:** implement controlled uploads if business verification documents/media are required.
7. **Native release validation:** build and test current iOS/Android releases on physical devices.
8. **Operational services:** configure notifications, AI provider, monitoring and alerting as required by launch scope.
9. **Real marketplace data:** onboard real verified businesses/products/services/categories through controlled workflows. No fake data should be introduced to satisfy tests.

## Validation evidence

### Baseline

- Run #84: green before the Phase 1 production-hardening work.
- Run #94: green on commit `275679e56c71420d37d4f35b285e179c6573eb93`; both the mobile validation and Supabase function type-check jobs passed.

### Audit fixes

The audit fixes are committed on `main`. GitHub Actions is being used as the final source/build gate after those fixes. The exact post-fix run number is recorded here after it completes.

The CI workflow itself was not modified during this audit.
