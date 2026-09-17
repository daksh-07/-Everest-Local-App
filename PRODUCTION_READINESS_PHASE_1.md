# Everest Local — Production Readiness Phase 1

Audit date: 2026-09-17
Repository: `daksh-07/-Everest-Local-App`

## Scope

This audit reviewed the existing Expo/React Native application, Expo Router tree, Supabase schema/RLS/RPCs, Edge Functions, authentication, marketplace lifecycles, commerce/Stripe, AI, delivery, admin authorization, environment configuration, storage, error/loading/empty states, deep-link configuration, and mobile usability. No fake marketplace data was added.

The audit distinguishes code existence from actual connection, authorization, and real-backend verification.

## A. VERIFIED WORKING

### CI / static validation
- TypeScript passes in GitHub Actions.
- ESLint passes in GitHub Actions.
- Static security/navigation audit passes and understands Expo Router index routes, route groups, dynamic/catch-all routes, and supported navigation references.
- Expo Doctor passes.
- Expo web bundle passes.
- Supabase Edge Function Deno type-check passes.

### Application/backend foundations
- Expo SDK 53 / React Native / Expo Router application structure is present.
- `app/index.tsx` is the Expo Router root route (`/`); `_layout.tsx` defines the root Stack.
- Supabase Auth uses persistent SecureStore-backed sessions and server-side `auth.uid()` authorization.
- Customer service requests are created through a SECURITY DEFINER RPC that derives the customer from the authenticated session and invokes server-side matching.
- Matching is deterministic and restricted to active, verified businesses that serve the requested suburb.
- Business opportunities and quote submission use server-authorized database functions.
- Quote acceptance creates a booking server-side and prevents duplicate bookings through the unique quote relationship.
- Booking state transitions are server-authorized and constrained by role/state.
- Product creation and inventory adjustment are server-authorized.
- Product publication is verification-gated.
- Product checkout derives pricing and inventory from database state and reserves inventory transactionally.
- Stripe webhook signatures are verified server-side.
- Stripe event records provide durable idempotency state.
- Ask Everest credentials are server-only and marketplace context is fetched through an authenticated Supabase client using public/verified records.
- Admin verification actions call a SECURITY DEFINER admin authorization function rather than relying on hidden UI controls.
- No production marketplace seed/fake data is included.

## B. PARTIALLY IMPLEMENTED

| Area | Status | Evidence / limitation |
|---|---|---|
| Customer auth | PARTIAL | Signup/login/logout/reset are connected to Supabase Auth, but centralized route guarding is not implemented. Backend authorization remains authoritative. |
| Customer request lifecycle | PARTIAL | Request → matching → opportunity → quote → booking exists. Real target-backend E2E execution remains unverified without a configured Supabase project and test accounts. |
| Deterministic matching | PARTIAL | Server-side matching exists, but there is no production scheduler/queue for re-matching or expiry processing. |
| Quote lifecycle | PARTIAL | Send/accept exists; viewed/declined/expired/cancelled UI/actions are incomplete. |
| Service booking payment | PARTIAL | Quotes with a deposit can enter `PENDING_PAYMENT`, but a service-specific Stripe checkout/webhook path is not wired. The hardened booking RPC no longer allows a business/customer to falsely confirm an unpaid booking. |
| Messaging | PARTIAL | Participant-scoped conversations/messages exist, but the app currently lists conversations only; there is no complete conversation creation/thread composer flow. |
| Reviews | PARTIAL | Server-side verified-transaction review RPC and constraints exist, but review creation/display UI is not implemented. |
| Product marketplace | PARTIAL | Catalog, inventory, cart and product checkout foundations exist. Current checkout is pickup-only; delivery selection/fees are not wired into the customer checkout UI. |
| Stripe | PARTIAL | Checkout/webhook code is server-side and hardened, but real Stripe test-mode payment/webhook execution against the target Supabase project is not verified in this repository environment. Marketplace Connect/provider payout flows are not implemented here. |
| Delivery | PARTIAL | Delivery schema and controlled status transitions exist. Creation/assignment/driver operations are not fully wired into the application workflow. |
| Business onboarding | PARTIAL | Business creation, verification submission, services, service areas, products and dashboard exist. Supporting verification-document upload/storage is not implemented. |
| Notifications | PARTIAL | In-app notification table/triggers exist. Push/email/SMS delivery channels are not configured. |
| Ask Everest | PARTIAL | Server-only AI function exists and is constrained to supplied public records. A real AI provider is an external configuration requirement. |
| Account deletion | PARTIAL | Hard deletion is protected by an authoritative preflight and is only permitted where no retained marketplace/business/audit records would violate foreign keys/history requirements. Accounts with retained records require support closure rather than unsafe hard deletion. |
| Location | PARTIAL | Database schema supports country/state/city/suburb/postcode, but several current screens still default/hardcode Sydney/NSW and need location/profile wiring before broader geographic rollout. |

## C. MISSING

- Complete service-payment Stripe checkout and verified webhook lifecycle for deposits/full service payments.
- Customer conversation creation and full messaging thread/composer UI.
- Review creation and review display UI.
- Customer delivery method/fee/address selection and delivery checkout integration.
- In-app delivery creation/assignment workflow for operations/driver accounts.
- Verification-document upload and controlled Supabase Storage buckets/policies.
- Production push/email/SMS notification providers.
- Centralized authenticated route/session guard and explicit deep-link session recovery UX.
- Production-grade background processing for opportunity/quote expiry and other scheduled marketplace jobs.
- Full Stripe Connect onboarding, KYC, provider payouts, platform fee/transfer architecture, refunds/disputes handling.
- Real target-project integration tests against Supabase Auth/RLS/RPCs and Stripe webhook events.
- Native iOS/Android release builds and physical-device validation.

## D. SECURITY RISKS / HARDENING APPLIED

The audit identified and corrected these genuine issues:

1. Business users could previously write directly to services/products/quotes/opportunities and potentially bypass controlled workflows. Direct client writes are now revoked; controlled RPCs remain the write path.
2. Notifications were writable by authenticated clients. Client insert/update/delete is now revoked; server triggers remain the generation path.
3. Product image visibility did not enforce the same active + verified business boundary as product discovery. The public policy is now aligned with verified business visibility.
4. Inventory reactivation could previously return an out-of-stock product to ACTIVE without checking business verification. The authoritative inventory function now checks verification before automatic reactivation.
5. Product publication could previously mark a zero-available-stock product ACTIVE. Publication now requires available inventory.
6. A business/customer could previously move a `PENDING_PAYMENT` service booking to `CONFIRMED`. That transition is now blocked for non-admin callers.
7. Stripe success handling previously updated order/payment state before inventory finalization in separate operations. Stripe order success/failure is now processed atomically by trusted database functions.
8. Stripe event processing could leave an event permanently stuck in PROCESSING. The claim function now permits safe recovery of stale/failed event claims.
9. Stripe PaymentIntent events did not explicitly receive order metadata. Checkout now sets PaymentIntent metadata as well as Checkout Session metadata.
10. Checkout errors after Stripe accepted a session could previously release the reservation. The checkout function now retains the pending order/reservation after a Stripe session has been created so the verified webhook can complete it.
11. Checkout idempotency now persists the provider Checkout Session ID and rejects reuse of a completed/failed attempt rather than silently creating an ambiguous new payment attempt.
12. Account deletion now performs an authoritative database preflight before deleting the Auth user, avoiding unsafe deletion of accounts with retained foreign-key/audit history.

### Security properties verified from source
- Service-role key is only referenced by Edge Functions.
- Stripe secret/webhook secret are only referenced server-side.
- AI API key is only referenced server-side.
- Mobile configuration uses `EXPO_PUBLIC_*` variables only.
- Client payment/order state is not trusted as the source of truth.
- Admin verification is server-authorized.
- Business verification status is protected from normal business updates.
- Inventory reservation/finalization is server-side and lock-based.
- Sensitive lifecycle tables use controlled RPCs rather than ordinary client writes.

## E. REQUIRED EXTERNAL CONFIGURATION

### Public mobile configuration
These values are intended for the Expo mobile bundle:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (currently configuration contract; product checkout itself is server-created Stripe Checkout)
- `EXPO_PUBLIC_APP_ENV`

### Trusted server / Edge Function configuration
These values must never be bundled into the mobile app:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AI_API_URL`
- `AI_MODEL`
- `AI_API_KEY`
- `STORAGE_CONFIG` (when storage/upload is implemented)
- `NOTIFICATION_CONFIG` (when notification channels are implemented)

The repository's `.env.example` explicitly separates public mobile values from trusted server configuration.

## F. REQUIRED MANUAL DEVICE TESTS

Before a real release, test on at least one current iPhone and one current Android device:

1. Fresh install → signup → email verification → login.
2. Kill/reopen app → session persistence.
3. Expired/invalid session → protected operation fails safely and user can recover.
4. Customer request submission → matching → opportunity/quote appearance.
5. Quote acceptance → booking creation → cancellation/state transitions.
6. Business onboarding → verification submission → admin approval → service/product publication.
7. Business cannot access another business's opportunities, orders, products, inventory or private records.
8. Customer cannot access another customer's requests/orders/messages.
9. Product add-to-cart → quantity changes → stock exhaustion handling.
10. Stripe Checkout in test mode → successful payment → webhook → order/payment state → inventory decrement.
11. Stripe failed/cancelled payment → reservation release → no false paid state.
12. Stripe duplicate webhook delivery → exactly-once effective state transition.
13. Deep links from Stripe success/cancel URLs and auth recovery.
14. Keyboard handling, scrolling, safe areas, small/large phones, orientation behavior and offline/error recovery.
15. Accessibility labels, focus behavior, touch target sizes and readable error/empty/loading states.
16. Admin authorization from a non-admin account and direct RPC attempts.

## G. BLOCKERS TO REAL LAUNCH

The repository is CI-green but is **not yet production-launch ready**.

Launch blockers are:

- A real Supabase production project with migrations applied and RLS/RPC behavior tested against real customer/business/admin accounts.
- Real verified marketplace businesses, services, categories and products created through controlled workflows; no fake seed data should be used.
- Real Stripe test-mode end-to-end verification, webhook registration, signature verification and failure/retry testing before live mode.
- Service-payment flow completion if paid service bookings are part of launch scope.
- Storage/upload implementation for verification documents and media if those workflows are required for launch.
- Completion of messaging, reviews and delivery operational workflows if those are launch-critical.
- Native iOS/Android build and physical-device validation.
- Production notification provider configuration if customer/business alerts must leave the app.
- AI provider configuration and policy validation before enabling Ask Everest.
- Production monitoring/logging/error tracking and operational alerting.

## Validation

- Baseline GitHub Actions run #84 was green before Phase 1 hardening.
- GitHub Actions run #93 on commit `1acbe6633bff237b40f4b8ed0394d9d5ad8f3798` passed the complete mobile validation job and the Supabase Edge Function job after the Phase 1 hardening changes.
- A report-only commit is used after that verification so the repository documentation records the verified result; the newest GitHub Actions run for that documentation commit remains the final gate for the current `main` head.
