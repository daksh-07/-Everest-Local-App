# Phase 4 commerce verification

These are actual exported application screens backed entirely by deterministic, inert API fixtures. They are not evidence of a real Stripe transaction or deployed Supabase verification.

- `report.json`: six 390px dark-mode screens, product stock limits and cart mutation checks.
- `transactions/`: representative 320px light, 390px dark and desktop captures. Source scenario report has all layouts; only selected images are retained.
- `scripts/verify-commerce-flow.mjs`: product variant/quantity selection → cart updates → address requirement → interrupted checkout/retry → duplicate tap protection → fixture hosted checkout → cancellation and success returns → authoritative payment refresh → merchant confirmations → pickup collection. Also checks read-only/unauthorised workspaces, unpaid orders, empty carts and expired authentication.
- `tests/checkout-handler.test.mjs`: executes the actual Edge handler with mocked SDK boundaries, including canonical idempotency and provider timeouts.
- `tests/order-inventory-sql.test.mjs`: executes actual proposed SQL in isolated Postgres (PGlite), including variant/parent/untracked settlement, repeated webhooks, rollback, stock and quantity rejection, snapshot cleanup, claim/release guards and paid pickup permissions. It does not emulate deployed RLS or multi-connection concurrency.

Run browser checks after a web export served on port 4173, using `PLAYWRIGHT_MODULE` and optional `EVEREST_BROWSER_PATH`. `EVEREST_QA_BROWSER=webkit` selects WebKit; `EVEREST_QA_LAYOUTS=390:DARK` selects one layout. Every Supabase and hosted Stripe request is intercepted. No production writes or payment credentials are used.

## Rollout dependency — no migration applied

`20261017071853_phase4_order_inventory_and_pickup.sql` is a review-only migration. Pause product checkout traffic, reconcile/expire all pending/action-required product checkouts and all orphaned inventory holds, and only then apply in an approved staging/production rollout. The migration aborts if it finds an in-flight legacy product order: historical rows lack the inventory-reservation policy snapshot, so backfilling from mutable product settings would be unsafe. Do not zero stock/reservations to bypass the guard. Also reconcile/expire legacy open Stripe sessions for product and service attempts, even when their database record was already failed/cancelled by the older decline handler. Keep checkout traffic paused until the matching checkout Edge and webhook functions are deployed. The new Edge function requires `claim_order_checkout`; the collected action requires `complete_pickup_order`.

Configure `APP_PUBLIC_URL` on the Edge deployment to its trusted HTTPS application origin (no path/query/credentials). Returns always use that origin; clients cannot supply redirect URLs. Native users can explicitly open the returned order in the app. The legacy scheme mapping remains for already-created native Checkout sessions.

## Remaining acceptance

Authorised staging customer/business accounts, Stripe test-mode connected business and signed webhook delivery are unavailable here. Verify a real test payment, cancellation, declined-card retry, checkout expiry, webhook redelivery and business pickup collection in staging after migration review. Do not infer payment success from the browser return.

Physical iPhone/PWA and native keyboard/device tests remain separate from browser emulation. Carrier-based shipping completion/refunds and a full historic transition timeline need backend workflows; current detail presents only the real creation and latest update timestamps. No delivery ETAs are fabricated.

## Focused UX checks

The expanded actual-component script verifies delayed structural loading, item-local mutation feedback, keyboard-triggered address validation and focus, preserved typed text, independent job/review failure and retry, safe review eligibility, terminal status precedence and expired cart recovery. All progress indicators are indeterminate; no payment/booking success is optimistic.

WebKit can emit a native fetch diagnostic as `pageerror` when a fixture hard navigation or intentional auth-expiry transition cancels a read. The script excludes such a diagnostic only when the browser separately reports that exact URL as cancelled and a document change or the explicit auth-expiry transition is recorded. Those cases are retained in `navigation-cancellations.json`; application exceptions and uncorrelated failures still fail the test. This is fixture-teardown handling, not real-backend CORS verification.
