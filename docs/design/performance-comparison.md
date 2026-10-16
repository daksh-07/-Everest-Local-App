# Performance comparison

## Web (measured)

Environment: headless Chromium (Playwright 1.56) in a Linux cloud container, 390×844 mobile emulation, local `serve` of each build, inert Supabase fixtures (empty rows). Script: `scripts/measure-home-startup.mjs`. Five cold loads per build; medians reported.

| Metric | Before (`a8490d7`) | After | Change |
|---|---:|---:|---|
| JS bundle (`entry-*.js`) | 4,549,183 B | 4,545,003 B | −4.2 KB |
| Home time to "Browse services/categories" visible | 754 ms | 718 ms | within run-to-run noise (range 711–800 vs 700–730) |
| Supabase REST requests on Home load (signed in) | 11 | 11 | unchanged |
| Supabase RPC requests on Home load | 9 | 9 | unchanged |
| DOM elements after settle | 204 | 215 | +11 (persistent Shop entry, Ask button) |

The time-to-content difference is not claimed as an improvement; it is within the variance of a shared container. The point of the measurement is that the redesign added no requests and no meaningful render cost.

## Realtime (by code inspection, not measured)

The Live mini player's realtime channel previously subscribed to **all** `service_requests` and `quotes` changes visible to the user and re-queried on each. It now filters both by `customer_id`. For customers RLS already limited events to their rows, so the change is neutral; for admin accounts (who can read every row) it removes a reload per platform-wide change.

## iOS / Android

Not measured. No simulator, emulator or device was available in this environment, and EAS builds were not run. Animation changes in this pass are limited to removing the menu-sheet modal; no new animations were added.
