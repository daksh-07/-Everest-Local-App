# Phase 4 transaction completion

Branch: `phase4/marketplace-completion-20261017`, based on production main `1878274`.

## Recovery

All interrupted local work was preserved in `recovery/codex-phase4-20261017` at `a43e2a1` and pushed. That snapshot is unverified recovery material, not a release candidate. Main's tree matches Claude's last head `c705947`. The historical 457-test result does not apply to this branch.

## Checkpoints

- **A — in progress:** recovered product/cart UI; variant selection excludes unavailable/reserved stock; quantity cap 99; no silent truncation; synchronous add lock; product route remount prevents stale-product purchase. Cart reads authoritative stock and merchant identity, blocks invalid quantities and unavailable variants, retains server validation. Targeted tests passing; current screenshots and full validation still pending.
- **P1 messaging — active:** user escalated iPhone keyboard/composer defect. Investigate visible viewport ownership and multiline textarea sizing before further shopping work. Preserve messaging infrastructure and Apple system keyboard/accessibility features.
- **B — pending:** checkout return routes, session lifecycle/recovery, duplicate operation protection, payment verification.
- **C — pending:** customer order details, scoped merchant fulfilment and authoritative updates.
- **D — pending:** focused booking/payment reliability, final regression checks and PR.

## Known findings

- Checkout currently emits `everestlocal://order/success` and `/cancelled` returns, but neither route exists; web customers cannot reliably return to their order.
- No authorised staging accounts or test Stripe credentials are configured. No live credentials will be inspected or used. Real payment completion and device keyboard behaviour remain unverified.
- PR #97 remains open. Its geographic/RLS migrations and dispatch-related changes have not been applied or merged.
- iPhone screenshot contains a form-navigation toolbar consistent with Safari/PWA. Screenshot alone cannot distinguish installed PWA from Safari; native app has no custom accessory implementation. Write with Siri and keyboard language/microphone/emoji controls are iOS system UI.

No production deployment, merge, migration application, security policy or India-infrastructure change is authorised.
