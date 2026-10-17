# Focused transaction UX evidence

**Final local results:** 290 scenarios passed in Chromium and 290 in WebKit. Each engine exercised all five widths (320, 375, 390, 430, 1280px), both themes and reduced motion against the actual exported application components. Hosted checkout and all APIs are deterministic fixtures; no real payment or deployed RLS acceptance is established.

Representative captures show cart loading, keyboard-focused address errors, a saved-price checkout, booking secondary loading/error, and authoritative booking payment state. The narrow-screen [before](../booking/before/clipped-total-320-light.png) and [after](../booking/after/booking-payment-light-320.png) demonstrate the repaired total/progress layout. Existing messaging before/after captures and short recordings remain in [messaging evidence](../messaging/README.md).

The expanded tests verify:

- Structural loading for slow reads, without fabricated progress; local busy feedback and safe retry after a failed quantity mutation.
- Enter on incomplete checkout reveals an inline error and focuses the address. Typed data survives failed checkout; duplicate activation sends one operation.
- Saved item quantities/prices remain the order snapshots after the catalogue price changes.
- A server-confirmed expiry returns to the correct cancelled order, then a refreshed cart can begin a new attempt. Actual-handler tests verify the old key is rotated only for confirmed expiry, never merely for completed-but-unconfirmed checkout.
- Slow/failed job and review reads cannot blank booking/payment data. Supporting retry is independent; unknown review state suppresses review creation, and terminal booking status wins over stale arrival data.
- Server-confirmed payment refresh, customer details, merchant permissions, confirmation before fulfilment, pickup collection, guest restrictions, empty states and navigation recovery.

`chromium-report.json` and `webkit-report.json` contain the exact scenario executions. The navigation-cancellation artifacts are empty for the final local matrix: no native-fetch diagnostic was excluded. The harness still records provable fixture-navigation/auth-expiry cancellations separately if WebKit emits them; unrelated browser/application errors fail.

Reproduce with `EVEREST_QA_BOOKING=1`, `EVEREST_QA_LAYOUTS=320:LIGHT,320:DARK,375:LIGHT,375:DARK,390:LIGHT,390:DARK,430:LIGHT,430:DARK,1280:LIGHT,1280:DARK` and `scripts/verify-commerce-flow.mjs`, using the matching Playwright engine/module and a web export served on port 4173.

Genuine Stripe sandbox, complete-schema Supabase/RLS concurrency and physical iPhone/PWA/native keyboard acceptance remain release blockers. See [delivery](../../phase4-delivery-report.md) and [Phase 5](../../phase5-backlog.md).
