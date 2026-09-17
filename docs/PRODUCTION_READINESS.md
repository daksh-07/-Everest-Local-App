# Everest Local — Production Readiness + Current-State Verification

Audit date: 2026-09-17
Repository: `daksh-07/-Everest-Local-App`
Verified application head: `da703afae496e63d1aff10d09703ef47f018b2b6`

## Verification standard

- **VERIFIED** — source plus available CI evidence directly proves the checked behavior.
- **PARTIALLY VERIFIED** — implementation and static/CI evidence exist, but live backend/provider/device execution is incomplete.
- **UNVERIFIED** — source exists but the relevant runtime environment has not been executed here.
- **BROKEN** — a known correctness or security defect remains.
- **MISSING** — required capability is not implemented.
- **BLOCKED BY HUMAN CONFIGURATION** — completion requires an external account, secret, provider, device, or other human-controlled environment.

No fake businesses, products, reviews, orders, payments, availability, delivery records, or provider responses are used.

## 1. CURRENT VERIFICATION GATE

### CI — VERIFIED

Commit `da703afae496e63d1aff10d09703ef47f018b2b6` has a completed green GitHub Actions run (`35202588314`). Both jobs succeeded:

- Mobile validation: `npm install`, TypeScript, ESLint, static security/navigation audit, Expo Doctor, and Expo web export all passed.
- Supabase validation: all Edge Functions passed Deno type-checking.

The mobile CI log explicitly reports `18/18` Expo Doctor checks passed and the web export completed successfully. No automated test runner is configured in `package.json`; the available automated validation suite is therefore CI type/lint/audit/Expo/Edge-Function validation.

### Checkout/cart cleanup — VERIFIED at source/CI level; live runtime UNVERIFIED

The current implementation is:

`cart → authenticated RPC → locked inventory reservation → server-created Stripe Checkout → signed webhook → server-authorized order/payment/inventory transition → exact source-cart-item cleanup`.

The latest verification found and fixed a correctness gap in the previous cleanup implementation: deleting by product ID could remove a newly-added cart item for the same product while an older checkout was pending. Migration `025_checkout_item_snapshot.sql` now records each original `cart_item.id` on the order item and successful cleanup deletes only those original rows. The migration also preserves the customer's later cart edits/re-additions.

Live concurrent checkout, real Stripe delivery, and deployed PostgreSQL behavior remain UNVERIFIED.

### Messaging — PARTIALLY VERIFIED

Conversation creation is server-authorized and serialized by customer/business/request. The RPC validates the request owner, business participation, quote relationship, and booking relationship before creation. Direct conversation writes are revoked. Message reads/inserts are participant-scoped by RLS, message mutation is revoked, and read-state changes use an authorization-checked RPC. The thread/composer UI uses the participant-scoped service.

CI proves the code type-checks/lints/builds, but two-account adversarial RLS testing and native interaction remain UNVERIFIED.

### Password recovery — PARTIALLY VERIFIED

Supabase reset, Expo linking, recovery-code exchange, PASSWORD_RECOVERY handling, and password update are implemented. The app declares the `everestlocal` scheme. CI proves source/build validity. Actual expired/invalid links and iOS/Android/web deep-link behavior require a configured Supabase project and physical/browser runtime and are therefore UNVERIFIED / BLOCKED BY HUMAN CONFIGURATION.

### Product management — PARTIALLY VERIFIED

Product editing uses an authenticated SECURITY DEFINER RPC that derives the product's business owner from the database and checks business membership. Direct client product writes remain restricted by the existing RLS/security model. Product status/archive and inventory operations use controlled RPCs. Customer visibility is limited to active/out-of-stock products belonging to active verified businesses, while archived products fail the checkout RPC's `ACTIVE` status check.

Live cross-business/customer adversarial testing remains UNVERIFIED.

## 2. AUDITED AREAS

| Area | Status | Evidence / limitation |
|---|---|---|
| Checkout + cart cleanup | VERIFIED | Source review plus green CI on current head. Exact source cart-item IDs are now snapshotted for cleanup; live PostgreSQL/Stripe concurrency is UNVERIFIED. |
| Stripe product checkout | PARTIALLY VERIFIED | Server-side pricing/inventory, server-only secret, signed webhook, event claim/retry, success/failure/expiry/cancel/async paths exist. Live Stripe test mode is UNVERIFIED. |
| Stripe service deposit | PARTIALLY VERIFIED | Dedicated payment ledger, server-authorized success/failure RPCs, Checkout and webhook path exist. Live Stripe execution is UNVERIFIED. |
| Password recovery | PARTIALLY VERIFIED | Expo scheme/link handling and Supabase recovery code exchange exist; physical-device and configured-project behavior is UNVERIFIED. |
| Messaging | PARTIALLY VERIFIED | Participant RLS, server-authorized conversation creation, serialization, message immutability, read RPC, thread/composer exist; adversarial live isolation is UNVERIFIED. |
| Product editing/archive | PARTIALLY VERIFIED | Ownership/member check is inside the RPC; archive/status and inventory writes are controlled; live multi-business isolation is UNVERIFIED. |
| Database migrations | PARTIALLY VERIFIED | Migration order was reviewed through current migration 025 and current CI type/build checks pass; CI does not execute PostgreSQL migrations, so clean-database application is UNVERIFIED. |
| RLS / authorization | PARTIALLY VERIFIED | Sensitive writes are routed through controlled RPCs and participant policies are explicit; deployed-schema adversarial testing is UNVERIFIED. |
| Edge Functions | VERIFIED | Current CI Deno type-check job completed successfully on head `da703af...`. Runtime provider behavior remains UNVERIFIED. |
| Expo / web bundle | VERIFIED | Current CI TypeScript, ESLint, static audit, Expo Doctor and web export all passed. |
| Automated tests | MISSING | `package.json` exposes no test script/framework. No automated integration/E2E test suite is currently configured. |

## 3. CHECKOUT + CART SECURITY FINDINGS

### VERIFIED

- Checkout requires an authenticated user.
- Product prices and quantities used for the order are read from database product/cart state inside the server-side RPC; the client cannot supply the trusted total.
- Inventory availability is checked under row locks and reservations are created in the same database transaction as the order.
- The customer's cart is locked during checkout and one active pending checkout order is serialized per cart.
- The Stripe secret is read only by the Edge Function.
- Stripe Checkout is created from persisted order items, not a client-provided price.
- Webhook signatures are verified before processing.
- Stripe event IDs are durably claimed and failed/stale processing can be retried.
- Order/payment state changes are restricted to trusted server-side processing.
- Successful processing is idempotent: a succeeded order returns immediately on repeated processing.
- Failure/cancel/expiry/async-failure paths release reservations through trusted processing.
- Successful cart cleanup is scoped to the exact cart that owned the active checkout order and, on current head, to the exact original cart-item IDs captured when the order was created.
- Client retries with the same checkout idempotency key reuse the pending order/payment path rather than creating an independent order.

### UNVERIFIED

- Real Stripe test-mode payment/webhook execution.
- Concurrent database execution with two clients against the same final inventory unit.
- Real duplicate webhook delivery against a deployed Supabase project.
- Runtime behavior of all SQL policies/functions on the target database.

## 4. STRIPE SECURITY FINDINGS

**VERIFIED:** secret key server-only; client uses only the configured public Stripe key; database is authoritative for product/service amounts; signed webhook verification; event claiming; idempotent provider session creation; payment/order lifecycle authorization; expiry/cancel/async failure handling.

**PARTIALLY VERIFIED:** live Stripe behavior remains unexecuted.

**MISSING:** Stripe Connect onboarding/KYC, provider payouts/transfers/platform fees, refunds, disputes, and production marketplace settlement operations.

## 5. PASSWORD RECOVERY FINDINGS

**PARTIALLY VERIFIED:**

- Reset request uses Supabase Auth.
- Redirect URL is generated with Expo Linking.
- The `everestlocal` scheme is declared in `app.json`.
- Auth screen handles initial URLs and subsequent URL events.
- Recovery `code` is exchanged server-side through Supabase Auth before exposing the recovery password form.
- `PASSWORD_RECOVERY` transitions the UI into the password-update mode.
- Password update validates an 8–128 character password before calling Supabase.

**UNVERIFIED / BLOCKED BY HUMAN CONFIGURATION:**

- Supabase Auth redirect configuration must include the deployed web URL and native `everestlocal://auth` redirect as appropriate.
- Real expired/invalid recovery links must be exercised.
- iOS and Android physical-device deep links must be exercised.
- Browser/web recovery must be exercised against the configured Supabase project.

## 6. MESSAGING SECURITY FINDINGS

**VERIFIED in source:**

- Direct client conversation insert/update/delete is revoked.
- `get_or_create_conversation` derives the customer from the request rather than trusting a client customer ID.
- Caller must be the request customer, a member of the requested business, or an admin.
- The business must be associated with the request through an opportunity, quote, or booking.
- Optional quote and booking IDs are cross-checked against the same request, business, and customer.
- Conversation creation is serialized using a transaction-scoped advisory lock for the customer/business/request tuple.
- Participant message SELECT/INSERT policies verify conversation membership and sender identity.
- Message UPDATE/DELETE is revoked for normal clients.
- `mark_message_read` checks conversation participation and prevents a user from marking their own message read through that RPC.
- The UI's conversation ID is not an authorization boundary; database RLS/RPC authorization is the boundary.

**UNVERIFIED:** live Customer A vs Customer B and Business A vs Business B adversarial tests, concurrent conversation creation against the deployed database, and native keyboard/back-navigation behavior.

## 7. PRODUCT CATALOG FINDINGS

**PARTIALLY VERIFIED:**

- Product editing RPC derives `business_id` from the target product and requires business membership; the client cannot supply an alternate owner.
- Product creation, status/archive, and inventory operations use controlled backend RPCs.
- Customer product visibility is restricted by product/business status and verification.
- Checkout rejects products whose status is not `ACTIVE`, so archived products cannot be newly purchased.
- Cart/order data retains product snapshots for orders.

**UNVERIFIED:** live cross-business/customer RLS attacks and full deployed browse → detail → cart → checkout → order behavior.

## 8. DATABASE / MIGRATION FINDINGS

**PARTIALLY VERIFIED:**

- Migrations are numbered sequentially through `025_checkout_item_snapshot.sql` on the current head.
- Later migrations replace earlier functions with `CREATE OR REPLACE FUNCTION` rather than relying on client-side behavior changes.
- Sensitive lifecycle functions use `SECURITY DEFINER` with `search_path=public` and explicit caller checks where authenticated callers are allowed.
- Current CI validates Edge Function TypeScript and the mobile/static build but does not execute SQL migrations.
- A real clean Supabase database migration run is still required before claiming database runtime verification.

**UNVERIFIED:** clean-database migration execution, PostgreSQL runtime constraints/indexes/policies, and live RLS isolation.

## 9. FULL SECURITY AUDIT

**PARTIALLY VERIFIED:**

- IDOR defenses were reviewed for messaging, products, checkout, reviews, orders, business membership, verification and admin paths.
- Client-trusted roles, payment status and order state are restricted by the existing security model.
- Service-role and Stripe secret variables are consumed by server-side Edge Functions rather than mobile code.
- AI credentials are configured server-side and the AI path has no privileged mutation tool.
- No storage upload path is implemented, so there is currently no unrestricted marketplace upload surface.

**UNVERIFIED:** deployed RLS, Storage policy behavior once storage is enabled, live adversarial authorization tests, provider secret configuration, and native runtime attacks.

## 10. REQUIRED MANUAL / HUMAN-ENVIRONMENT TESTS

1. Supabase clean migration run through migration 025.
2. Customer A/B and Business A/B RLS isolation tests.
3. Two simultaneous checkout attempts for the same cart/final inventory unit.
4. Start checkout, add the same product again, complete the original Stripe payment, verify the newly-added cart row remains.
5. Duplicate Stripe webhook delivery.
6. Stripe expiry/cancel/async-failure and retry.
7. Service deposit success/failure/expiry/retry.
8. iOS password recovery deep link, including expired/invalid links.
9. Android password recovery deep link, including expired/invalid links.
10. Web password recovery.
11. Concurrent messaging conversation creation.
12. Customer A cannot read/write Customer B's conversation/messages.
13. Business A cannot read/write Business B's conversations.
14. Customer cannot edit/archive another business's product.
15. Archived product cannot enter a new checkout.
16. Keyboard, multiline composer, safe areas, scrolling, back navigation, loading and error states.

## 11. MISSING

- Automated integration/E2E test suite.
- Product delivery method/address/fee selection in checkout.
- Verification-document and marketplace media upload/storage.
- Push/email/SMS notification providers.
- Background scheduler/queue for quote/opportunity expiry and re-matching.
- Complete delivery creation/assignment/driver operations UI and external logistics integration.
- Production monitoring/error tracking/alerting.
- Stripe Connect onboarding/KYC/payouts/transfers/platform fees/refunds/disputes.
- Broader admin marketplace moderation/operations surfaces where required by launch scope.

## 12. BLOCKED BY HUMAN CONFIGURATION

- Live Supabase target project and test accounts.
- Stripe test-mode account plus registered webhook.
- iOS/Android physical-device build/signing and deep-link validation environment.
- AI provider account/configuration if Ask Everest is enabled at launch.
- Delivery/logistics infrastructure if delivery is launch scope.
- Production notification providers if push/email/SMS are launch scope.

## Current release assessment

**NOT launch-ready.** Current source/build validation is green, but live database/RLS/Stripe/native/provider verification is not available in this environment and several launch capabilities remain missing.

## Current engineering evidence

- Current HEAD: `da703afae496e63d1aff10d09703ef47f018b2b6` — `security: preserve cart items added during checkout`.
- Previous HEAD: `2dcb6466b84f73a8e0abcb47bf8fc11a59404dca` — `fix: scope completed checkout cart cleanup`.
- Password recovery hardening: `ccf8a25f7fccdc2485d2ff97385cc812c591d207` — Expo Linking redirect.
- Service checkout native-safe key: `62022dcea65f477508f1128fb15c93370ae24313`.
- Messaging serialization/security: `872e24a214a3984fd9820d4e9681b011ec9a516d`.
- Current green CI run: `35202588314`, both validation jobs completed successfully.

The report deliberately does not equate green CI with real-world verification.
