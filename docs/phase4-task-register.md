# Phase 4 transaction completion

Branch: `phase4/marketplace-completion-20261017`, based on production main `1878274`.

## Recovery

All interrupted local work was preserved in `recovery/codex-phase4-20261017` at `a43e2a1` and pushed. That snapshot is unverified recovery material, not a release candidate. Main's tree matches Claude's last head `c705947`. The historical 457-test result does not apply to this branch.

## Checkpoints

- **A — implemented and fixture-verified:** recovered product/cart UI; variant selection excludes unavailable/reserved stock; quantity cap 99; no silent truncation; synchronous add lock; product route remount prevents stale-product purchase. Cart reads authoritative stock and merchant identity, blocks invalid quantities and unavailable variants, retains server validation. Product/cart helper tests pass. Current 390px dark-mode product, cart, unavailable-cart and order screenshots inspected; six fixture browser routes pass including cart quantity/removal and variant stock bounds. See `phase4-evidence/commerce`. Final cross-layout transaction checks continue with B/C.
- **P1 messaging — implemented, validation checkpoint:** confirmed Safari home-screen PWA. Fixed missing shipped viewport CSS, compact autosizing composer, keyboard/list anchoring, deep-link reopening and per-thread context. 66 Chromium cases passed at 320/390/1280 light/dark; final representative evidence repeats 22 cases. Full suite: 460 tests pass, typecheck pass, lint 0 errors/12 existing warnings. See `phase4-evidence/messaging/README.md`. Matching WebKit 1.55 also passes all 66 cases locally after fixing viewport-test synchronization and cancelling obsolete bottom anchoring. All checks on messaging head `3f40de9` passed on GitHub, including Chromium/WebKit discovery and WebKit chat. Physical-device acceptance remains open.
- **B — pending:** checkout return routes, session lifecycle/recovery, duplicate operation protection, payment verification.
- **C — pending:** customer order details, scoped merchant fulfilment and authoritative updates.
- **D — pending:** focused booking/payment reliability, final regression checks and PR.

## Known findings

- Checkout currently emits `everestlocal://order/success` and `/cancelled` returns, but neither route exists; web customers cannot reliably return to their order.
- No authorised staging accounts or test Stripe credentials are configured. No live credentials will be inspected or used. Real payment completion and device keyboard behaviour remain unverified.
- PR #97 remains open. Its geographic/RLS migrations and dispatch-related changes have not been applied or merged.
- iPhone screenshot contains a form-navigation toolbar consistent with Safari/PWA. The owner confirmed an installed Safari home-screen PWA; native app has no custom accessory implementation. Write with Siri and keyboard language/microphone/emoji controls are iOS system UI.

No production deployment, merge, migration application, security policy or India-infrastructure change is authorised.
