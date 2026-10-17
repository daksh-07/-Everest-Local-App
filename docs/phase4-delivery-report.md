# Phase 4 — transaction and messaging delivery

PR: https://github.com/daksh-07/-Everest-Local-App/pull/105
Branch: `phase4/marketplace-completion-20261017`, production-main base `1878274`.

## Delivered implementation

- Preserved the interrupted Codex workspace in pushed recovery commit `a43e2a1`; no reset or discarded local work. Recovered the relevant product/cart changes selectively.
- Product selection uses authoritative variant/product inventory, sold-out states and quantity bounds. Cart quantities/removal, merchant identity and fulfilment/address requirements are actionable and recover from errors.
- Checkout resumes the stored pending order and canonical payment key across reloads and interrupted requests. Duplicate taps cannot create parallel UI operations. A persisted server claim protects inventory before the Stripe request, including an uncertain provider timeout.
- Returns use a configured trusted HTTPS origin and the correct order/booking route. Existing native scheme sessions have compatibility mapping and web returns offer explicit app handoff. Return parameters never mark a payment paid.
- Saved checkout review reads immutable order-item prices and quantities, so a later catalogue price change cannot misrepresent the amount being resumed.
- Proposed SQL captures each item's reservation mode and settles/releases the corresponding variant or parent inventory exactly once; untracked/made-to-order items do not fabricate stock. Inconsistent settlement rolls back. Customer edits/releases are rejected once provider creation has started.
- Customer order details show the merchant, item snapshots, quantities, server price breakdown, actual fulfilment information, payment status and real creation/latest-update timestamps. Return refresh is bounded; foreground/manual refresh and error recovery are supported.
- Business orders use the active workspace, permission-sensitive controls and finance reads, confirmation before status changes, and authoritative refetch. A narrowly authorised RPC completes paid, ready pickup orders. Existing delivery dispatch contracts remain intact.
- Booking payments preserve server deposit/balance calculations, currency, Connect/direct-charge fees and payment-ID idempotency. Fixed broken returns, expired-session recovery, duplicate UI actions, stale booking context, server refresh and a payout-readiness race that could falsely fail an uncertain Stripe attempt.
- Safari home-screen messaging now ships the required viewport stylesheet, uses a compact 52px initial composer with natural capped expansion, anchors conversation history correctly, preserves drafts/context and avoids obsolete scroll callbacks. Apple keyboard/Siri/accessory UI is untouched.

## Focused UX continuation

- Cart and booking loads reserve structural space and show static skeletons only after 180ms; instant responses do not acquire an artificial delay. Cart mutations show busy feedback on the affected item; payment operations keep their own busy state.
- Missing delivery information produces an inline error and moves keyboard focus to the address field. The checkout action remains discoverable; typed text survives a failed request. Stock/permission/unsupported-fulfilment blockers remain enforced.
- Booking identity, amounts and payment state load independently of work-plan/review data. Slow or failed supporting reads cannot blank the payment screen. Each supporting group has a local retry, prior work-plan data is retained, and an unknown review state cannot offer duplicate review creation.
- Payment action errors survive background refresh. Authoritative completed/cancelled/disputed booking status wins over stale arrival text. Primary product/cart/booking actions have restrained pressed feedback and accessible roles.
- Verified product-session expiry refreshes the cart and rotates the closed attempt key. Cart focus/foreground refresh reconciles server state; a completed-but-unconfirmed provider session retains its pending attempt. Actual-handler tests also protect against duplicate taps and late navigation after leaving the screen.
- The supplied UX research is qualified in [the playbook](../EVEREST_UX_RESEARCH_PLAYBOOK.md); the quick inventory and prioritised next work are in [Phase 5](phase5-backlog.md). No unrelated route redesign was started.

## Important boundaries

No production migration, deployment, merge, credential update, Stripe setting change, RLS policy widening or India infrastructure change was performed. PR #97 was reviewed for checkout/booking-return fixes; its migrations and dispatch changes were not merged. Its booking banner's `PAID` assumption was not copied: the actual payment enum uses `SUCCEEDED`.

The proposed migration is **not ready for unattended application**. No real transaction acceptance or production release is claimed. Pause product checkout traffic, reconcile all legacy pending product checkouts, review/test the migration in staging, and keep traffic paused through the matching Edge rollout. It aborts for pending/action-required order state or any unresolved inventory hold rather than invent historical reservation policy. Reconcile orphaned variant/parent reservations; never zero quantities merely to pass the guard. Before approved rollout, reconcile or expire legacy product **and service** Stripe Checkout sessions, including attempts the old database may already have marked failed/cancelled after a retryable decline. SQL alone cannot establish that provider state. The new checkout Edge function depends on `claim_order_checkout`; pickup completion depends on `complete_pickup_order`. Configure `APP_PUBLIC_URL` to the deployment's HTTPS application origin.

Stripe signature verification, webhook event claiming/retry and existing payment/dispatch contracts remain. Retryable card declines do not release still-payable Checkout reservations; only authoritative success or final failure does. Service payout-readiness loss also cannot falsely fail a potentially payable session whose earlier response was lost.

## Validation and evidence

- Full local test suite: **499 passing**, including actual Edge-handler harnesses and **13 executable Postgres inventory/permission/rollout cases**.
- TypeScript and web export/provenance checks pass. ESLint: **0 errors, 12 existing warnings**. Static and migration audits pass (236 migrations).
- Messaging: **66 Chromium + 66 WebKit** fixture scenarios at 320/390/1280, light/dark. The matching WebKit CI runtime was used locally. [Before/after images and recordings](phase4-evidence/messaging/README.md).
- Final commerce/booking UX matrix: **290 scenarios per browser**, covering 320/375/390/430/1280 and both themes, with reduced motion and keyboard interaction. Earlier checkpoint results were 88 transaction and 70 focused booking/layout scenarios per browser. Final checkpoint results are recorded in [task register](phase4-task-register.md) and [evidence](phase4-evidence/commerce/README.md). Screens are the real exported application with deterministic API fixtures; hosted checkout is explicitly fake and takes no payment.
- GitHub CI status must be read against the final pushed head; intermediate checks are not final-head evidence.
- Local Expo Doctor previously passed 16/18; two external schema/directory lookups were unavailable (network ECONNREFUSED). GitHub's Expo Doctor gate passed for the transaction checkpoint. Native CI gates are recorded separately from physical-device acceptance.

PGlite is a pinned **development-only** dependency. It executes the actual proposed SQL without a Supabase credential or production write and is not imported by the application. Payment polling no longer waits on or repeatedly fetches supporting review/job data. The exported JavaScript is approximately 4.5 MB uncompressed; no production runtime dependency was added. No real-network performance benchmark was performed.

## Not yet verified / unfinished

1. The user’s real-payment definition of done is **not met**: authorised Stripe test-mode/staging accounts and signed webhook delivery were unavailable. Verify customer purchase → genuine test payment → server-confirmed return → scoped business fulfilment after migration review, including declines, expiry, interrupted persistence and webhook redelivery.
2. The physical iPhone installed-PWA keyboard scenario, Safari/system accessory geometry, native iOS/Android keyboards and background/foreground behavior still need device/simulator acceptance. Desktop WebKit and synthetic visualViewport transitions cannot prove that behavior.
3. In-memory Postgres fixtures verify the actual function bodies and grants, not deployed Supabase RLS, full-schema compatibility, multiple database connections or live Connect account transitions. Review the proposed migration against the complete staging schema before approval.
4. Customer refund/self-cancellation, carrier shipping completion, full historic order-transition timestamps and additional authorised customer-contact workflows require backend support/reconciliation. The UI provides recorded states/help and does not invent those capabilities or timestamps.
5. The complete Request → Quote → Acceptance → Booking → Payment → Completion workflow and expired-authentication return-to-transaction path still need staging verification, particularly role-specific quote acceptance, cancellation/refunds and customer/business consistency. Existing regression/security checks pass; no PR #97 backend migrations were imported.
6. CRM booking-editor/employee-confirmation recovery work remains on the recovery branch for a separate focused, verified milestone. It was not silently reapplied over the merged design work.

Recommended next milestone: approved staging rollout and genuine Stripe test transaction with a test business, followed by physical iPhone PWA acceptance; then secure cancellation/refund and shipping-completion workflows. No production release is implied by this PR.
