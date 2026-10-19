# Phase 5B — Live and business operations

Based on production main `d9faf4f`, rechecked on 19 October 2026. PR #107 remains open and unmerged. Home, Search, Profiles and Business Today are unchanged here. Its discovery migration and shared navigation fixes are not copied. No application/database deployment, permission changes, migrations, payments or checkout changes were made. Vercel deployment is disabled for this review branch.

## Reproduced and fixed

The production-main web export was exercised with controlled API responses. These are real application screens, with fixture transport, not tests against production accounts.

| Trigger on main | Before | This branch |
|---|---|---|
| Initial Live status fails | Unavailable screen has no retry | Reconnect action; missing requests retain a route back to My Everest |
| A 30-second status poll precedes 45-second expansion | New state objects continually restart the deadline | Lifecycle/count primitives retain the deadline; one expansion through a poll |
| Live map response is delayed | Status and quotes wait for the whole batch | Independent application of successful reads; bounded read timeouts |
| Socket resubscribes after missed activity | Subscription clears connection warning without fetching missed state | Immediate authoritative refresh; separate transport and stale-status feedback |
| Provider opens an offer | Unconsumed Supabase builder never sends the view RPC | Executed scoped view intent; opportunity updates refresh customer counts |
| Acceptance loses a race / cancellation returns false | Obsolete provider actions remain / cancellation appears successful | Refresh authoritative lifecycle after rejection; refused cancellation stays visible |
| Jobs count requests fail | Job rows are never requested, zero badges and empty work message | Independent rows and nullable counts; count-only retry preserves rows |
| Today query finishes after switching Jobs tabs | Today work appears under Completed | Generation guards and a loaded-tab key prevent cross-tab rows |
| Calendar availability fails | Offline label and “Nothing scheduled” replace healthy appointments | Independent sources, unknown availability, per-source retry, explicit incomplete schedules |
| CRM Inbox or another dataset fails | Whole board falls back to zero metrics | Independent scoped sources; healthy deals/contacts remain; unknown aggregates and reports are withheld |
| Inbox / employee queue read fails | Empty/caught-up states appear alongside errors | Explicit retry; no false empty state, including during retry; healthy rows survive refresh |
| Employee completes an assignment | One tap immediately completes it | Confirmation, inert cancellation and disabled competing actions |
| Availability initial read fails | Default values remain editable and saveable | Form waits for a successful load; role gate and labelled controls |
| Read-only business receives an offer | Actionable Interested/Pass alert appears | Alerts limited to roles that can operate work; reduced motion respected |

Calendar controls now fit 320px and have 44px targets. Live's map takes less of short screens so status appears sooner. The native map camera depends on coordinates/radius, avoiding recentering on equivalent polling objects, and honors reduced motion. Native camera behavior still needs device verification.

## Evidence and verification

`before/` contains production-main failures. `after/` contains the corresponding fixed and recovered screens plus representative loaded light/dark layouts. Machine-readable reports are stored alongside this document. All browser writes, authentication and realtime traffic are intercepted; no customer requests or notifications were created.

The browser suite covers seven screens at 320, 375, 390, 430 and 1280px: both themes, both motion settings, empty/error layouts, local retries, delayed data, offline recovery, websocket resubscription, event coalescing, role restrictions, mobile touch, keyboard focus, cancellation and completion. Clock-controlled tests reproduce the expansion stall and delayed Jobs response on main.

Full-document axe scans retain two precisely scoped existing failures: ModeSwitcher’s untyped trigger and the business tab bar’s missing tablist parent. Both belong to #107. The suite records them and rejects other violations; it does not disable the rules globally. This PR therefore does **not** claim a clean whole-application accessibility audit before #107 lands.

Reproduce with an exported app served locally:

```sh
npm run typecheck
npm run lint
node --experimental-strip-types --test tests/*.test.mjs
npm run build:web
# Install isolated Playwright 1.64.1 and axe 4.14.0; set their module paths as needed.
EVEREST_PREVIEW_URL=http://localhost:4173 node scripts/verify-phase5b.mjs
EVEREST_QA_BROWSER=webkit EVEREST_PREVIEW_URL=http://localhost:4173 node scripts/verify-phase5b.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/audit-phase5b-live.mjs
```

The dedicated GitHub workflow runs these browser checks on Chromium and WebKit, retaining artifacts. The local validation result and counts are in `validation.json`.

## Backend audit and remaining work

The exact checked-in `release_everest_live_wave` function was executed in disposable PostgreSQL with minimal table fixtures. Nearby matching, duplicate prevention, offline-provider exclusion, expiry and global remote capability matching passed. Three eligibility issues remain:

1. A Sydney provider with a matching Carlton named service area receives a Melbourne 3km wave: the named-area OR bypasses distance limits.
2. `AVAILABLE_NOW` ignores a future `available_from`.
3. An unfinished assignment associated with a removed member can exclude the business.

These findings are in `live-geography-audit.json`. They are verified against checked-in SQL, not a claim about the currently installed production function. No migration is supplied or applied here. Matching semantics and a scoped backend correction need separate review and staging verification. Remote matching is intentionally global; its local-map language also needs product review.

Real multi-account RLS, push delivery, concurrent acceptance transactions, provider location freshness, external calendar/CRM integrations and physical iOS/Android maps/keyboards/screen readers still require an authenticated staging environment and devices. No staging credentials were available. Acceptance's existing database locks and request-state guards were reviewed; browser tests verify rejection recovery, not a live multi-session transaction. Business Today should be integrated after #107 lands, without reimplementing its resilience work.
