# Booking payment and narrow-layout evidence

The before image shows the real 320px booking screen with a clipped total and truncated progress labels. The after images show the constrained heading column, complete amount and readable current-stage caption.

Chromium and WebKit each passed 70 fixture scenarios across 320, 375, 390, 430 and 1280px, in light and dark themes. `scripts/verify-commerce-flow.mjs` checks that the total fits inside its actual row, not merely that the document has no horizontal scrollbar. It also verifies pending payment, expired-session retry, duplicate taps, cancellation return, authoritative deposit/balance refresh and switching booking context. Matrix mode: `EVEREST_QA_BOOKING=1 EVEREST_QA_BOOKING_LAYOUT_ONLY=1` with `EVEREST_QA_LAYOUTS`.

These are actual exported application components with intercepted APIs. No real payment, deployed RLS or physical iPhone behavior is established by these captures. See the Phase 4 delivery report for release blockers.
