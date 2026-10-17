# Phase 5 — short priority backlog

This is a targeted code inventory, not a new design audit or a claim that every opportunity below was reproduced in production. Keep PR #104's visual system and PR #105's messaging/transaction work.

1. **P0 — approved staging transaction acceptance.** Review the complete-schema migration and rollout prerequisite; test genuine Stripe test-mode customer/business accounts, signed webhook retries, uncertain persistence, inventory contention, expired sessions, role-specific RLS and deposit/balance completion. No production rollout is implied by fixture checks.
2. **P0 — physical-device acceptance.** Test the installed iPhone Safari PWA keyboard with the original messaging scenario, app return URLs and background/foreground recovery. Include Safari, native iOS/Android, text scaling and one-handed operation. Browser WebKit/visualViewport simulation remains supporting evidence.
3. **P1 — secure lifecycle completion.** Add reviewed refund/cancellation reconciliation, carrier shipping completion, authorised customer contact and real transition history. Reconcile interrupted legacy checkouts and orphaned inventory holds before the proposed inventory migration, including externally payable sessions whose database attempt was already failed/cancelled. Resume CRM/employee work from recovery commit `a43e2a1` selectively, with confirmation/permission tests.
4. **P1 — independent discovery/dashboard states.** Apply the proven booking-section pattern only after reproducing each failure below. Preserve caches and scope-specific permissions; avoid blanket refactors.
5. **P2 — measured performance and accessibility.** Measure real cold start, API latency, media galleries, font scaling and gesture conflict on actual devices. Profile before adding effects or changing navigation.

## Quick inventory requested for this phase

| Surface | Existing behavior / code evidence | Focused next verification |
|---|---|---|
| [Home](../app/index.tsx) | Structural skeletons, media warnings and retry exist. Several shop reads convert a rejection to `[]` inside combined loads. | Inject failed shop reads alongside successful business/feed reads; distinguish unavailable from truly empty and offer a rail-local retry. |
| [Search](../app/search.tsx) | Request-version guards, sign-in recovery and retry already exist. Query/tab changes clear result arrays. | Verify same-query refresh can retain useful results with a stale label, without showing results for a different query; check keyboard/filter empty-state recovery. |
| [Business profile](../app/business-profile.tsx) | Social/growth reads already use settled outcomes. Business/service/product/review core reads share an all-or-nothing error path. | Inject review/catalogue failure and keep the verified identity and healthy sections usable; extend existing partial handling rather than rebuilding the profile. |
| [Everest Live](../app/everest-live.tsx) | Core, quotes and map already load independently; cached status and reconnect controls are present. | Device-test reconnect, map movement, quote acceptance/cancellation races and reduced-motion/keyboard transitions. No cosmetic redesign proposed. |
| [Business Today](../app/business-today.tsx) | CRM, job, order, inbox and finance reads share a combined load; any checked error aborts the update. | Isolate unavailable finance/CRM sections from operational work, retain scoped prior data and label unavailable counts; verify each staff role without widening reads. |

Authentication return-to-cart/order/booking after an expired session also needs a complete staging check using the existing pending-navigation mechanism. Do not infer that an auth retry or Stripe return settled a payment.
