# Everest Local performance recovery — 24 October 2026

**Release status: NO-GO for declaring the incident resolved.** Focused code fixes and reproducible browser evidence are delivered in PR #112. The reported whole-app freeze has not been reproduced with real affected accounts/devices. No production deployment, database mutation, migration or payment change was made.

## Source and regression analysis

The public production `build-info.json` returned commit `651814d1c7a29115518e9dc2bab983dd01ffdf82`, environment `production`. This is `integration/final-release-20261023`, whereas main was `2a20c73` (#110). Recovery branches from the deployed commit and targets the integration branch, preserving its additional 180-file release delta. Do not deploy main over this production release.

GitHub confirms #106, #107, #108, #109 and #110 are merged. #107/#110 merged October 23; #106 October 17; #108/#109 October 19. Their earlier PR descriptions saying “unmerged” are historical, not current status. The animation dependency predates these PRs (persistent pager history includes `997afee`, September 27). The section loader was introduced by `9ba0135` (October 18). This identifies provenance, not proof of incident onset.

## Confirmed failure mechanisms and fixes

1. **Tab route/input state waited for spring completion.** The baseline changes URLs only after an animated callback; interruption can cancel that commit. Taps now synchronously commit selection/route and animate the track for 180 ms. Swipes retain their existing settle behavior. Navigation does not wait for data.
2. **Held section reads never settled.** Holding the Home businesses response produced no recovery after 16 seconds in both guest and synthetic authenticated baseline runs. Section loaders now settle with existing local retry UI at 15 seconds. REST GET/HEAD and the two explicit access/workspace RPC reads abort at 12 seconds. Late section responses remain version-scoped. No blanket retry loop was added.
3. **Root access errors covered unrelated customer journeys.** Previously a failed role-access RPC drew a full-screen blocking overlay over every protected customer screen. Ordinary customer screens now keep their own authenticated/RLS-backed recovery; business, driver and admin surfaces retain the root error overlay. Session restoration is bounded at 10 seconds and access restoration at 12 seconds. Root session identity no longer waits for access data. Same-user INITIAL_SESSION/SIGNED_IN callbacks no longer repeat startup access reads; TOKEN_REFRESHED, USER_UPDATED and MFA events still refresh access. Account changes still remount retained scenes to prevent cross-account state leakage.

The auth-lock hypothesis was investigated and **not established**: the callback did not return/await the access RPC, and the installed auth SDK has changed its locking behavior. No deadlock claim or speculative auth-lock replacement is part of this fix.

`lib/read-fetch.ts` changes only REST reads and explicitly named bootstrap RPCs. Auth HTTP calls, arbitrary POST/PATCH/DELETE operations, acceptance/inquiry/payment RPCs and Edge Functions pass through unchanged. Cancellation propagates from callers and timers/listeners are cleaned up. Payment processing, commissions, settlements, RLS and policies are untouched.

## Backend evidence (read-only production inspection)

Project: Everest Local, `bmwbljefnamvjnmuvkvv`, ap-southeast-2, reported ACTIVE_HEALTHY. Cumulative pg_stat_statements snapshot:

| Operation | Calls | Mean execution ms | Historical maximum ms |
| --- | ---: | ---: | ---: |
| get_my_access_context | 1,853 | 33.18 | 2,861.24 |
| get_my_workspace_context | 2,885 | 36.85 | 5,147.08 |
| process_everest_live_searches | 39,770 | 12.31 | 3,125.75 |
| process_service_dispatch_queue | 46,847 | 7.56 | 992.69 |

These are cumulative database execution statistics, **not current end-to-end request latency or affected-user query plans**. A subsequent activity snapshot had zero lock waiters, zero active client queries older than five seconds and zero idle transactions. Unified log source counts were inspected; no private message/customer data was retrieved. No database-wide freeze was established.

Advisors report 187 [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and 146 unused indexes. Security notices include 23 no-policy tables, 5 anonymous and 221 authenticated executable SECURITY DEFINER functions, plus disabled leaked-password protection. These require scoped review; counts alone do not prove exposure or incident causality. No indexes/policies/functions were changed based on these notices. Production has no connected staging counterpart for this app.

## Measurement method and limits

Production Expo web exports, Chromium 154.0.8037.57 on Linux, 390×844 viewport, ordinary desktop browser context, no CPU/network throttle. Synthetic session/REST fixtures and closed fixture WebSockets; no synthetic writes reach production. Timing is Playwright click-to-URL, which includes automation/actionability overhead and is **not paint completion or physical-device latency**. Long tasks are browser PerformanceObserver entries, not native frame drops. Raw JSON accompanies this document.

The first before/after sample overlapped other exports/browser jobs. It confirms bounded recovery and faster cached tab samples but shows noisy cold-start/first-visit results; it cannot substantiate a startup speed improvement. Baseline authenticated transitions were 301–505 ms; the first patched sample ranged 154–896 ms. Long tasks still occur; no claim of zero JS stalls or a universal sub-300 ms SLA is made. A later final run also checks rapid taps and access-error isolation.

## Verification and release gates

Local: 509 unit tests pass, including security/lifecycle contracts and new actual abort/cancellation/mutation-exclusion tests. TypeScript passes. ESLint passes with 0 errors / 11 existing hook warnings. Web production export passes; static audit checks 837 source/config files and 97 routes; migration audit checks 244 canonical migrations. Generated legacy test aliases were cleaned, not committed or deployed.

Browser coverage and final export results are recorded in `results.json` and the attached logs. Earlier broad-run attempts failed due to a local server lacking SPA fallback and then a rebuild deleting its working directory; those were harness failures and are not counted as application passes. Final browser tests serve an immutable production export.

Unavailable: physical Android/iOS, native runtime profiling, supported device frame/memory measurements, real login/session refresh with staging accounts, two-account messaging/RLS/realtime, actual dispatch/quote/booking transaction completion, and payment verification. Native bundle export does not replace runtime or signed-store-build validation. WebKit downloaded but cannot launch with this container's missing GTK4/Graphene/Harfbuzz ICU/Manette/Hyphen/GLES libraries; sudo is unavailable. Longer memory soak and lossy-network/device tests remain open. The 4.68 MB web bundle and ~8 MB Hermes bundles remain an optimization opportunity; no unsupported bundle-size gain is claimed.

Next release action: finish CI and real staging/account/device acceptance, including the affected incident journey and privileged access refresh. Review and merge #112 into the deployed integration branch; reconcile main separately. Build the exact reviewed commit with existing production configuration, manually deploy only after gates pass, check build-info provenance and smoke-test guest/authenticated discovery, tabs, chat, profiles, business mode, Live, quotes and bookings. No migration is required for this PR. Roll back to deployment/commit `651814d` if necessary. Keep existing database/migration rollout gates from the integration release; this PR does not waive them.

### Final focused browser result

The expanded regression passes in Chromium on the final production export: three navigation rounds (guest Home/Explore and authenticated Home/Explore/Activity/Messages/Account), rapid same-turn tab dispatch, held-read local recovery/retry, offline navigation/reconnection, customer access-RPC failure isolation and privileged-business access failure overlay. Zero page exceptions. Synthetic authenticated account state is not a real login test.

| Click-to-URL sample | Baseline median / range | Final median / range |
| --- | --- | --- |
| Guest, 6 transitions | 320.5 / 310–358 ms | 85 / 71–348 ms |
| Authenticated, 15 transitions | 317 / 301–505 ms | 93 / 64–261 ms |

Final cold UI times were 1702 ms guest and 743 ms authenticated, versus 733/783 ms baseline; environment contention means there is no defensible cold-start improvement claim. Baseline/first-after recorded 51–182 ms long tasks; final focused run recorded none, which is not a device-level freeze guarantee. Request totals differ because the final test includes extra reload/access-failure cases; do not compare them as request-volume reductions.

The broader operations runner reached business Calendar/Inbox/My Work/CRM/Availability and Live scenarios but failed when its Reconnect target detached during automatic recovery (`operations-failure.log`). This remains a failed browser check, not a full operations pass. The broader discovery runner passes 9 scenarios, 96 loaded layouts, 48 empty layouts, 48 error layouts and 8 accessibility scans, with zero page exceptions. It exercises Home, Search, Business Profile and Business Today section failures and local recovery. Detailed results and remote CI are tracked in `results.json`.

### Confirmed live production defect: code/database rollout mismatch

A separate real, unmocked guest smoke test against deployed `651814d` opens Home in 1181 ms and switches Explore/Home in 355/326 ms, with no page exceptions. But discovery is functionally broken: businesses, Shop, media, reactions, comments and verified-work reads return HTTP 401 / PostgreSQL `42501`. Response evidence (`production-errors.log`) identifies:

- businesses: `permission denied for function is_admin`;
- Shop: `permission denied for table inventory`;
- media/verified work: `permission denied for table user_blocks`;
- reactions/comments: `permission denied for table follows`.

Read-only catalog verification confirms anon cannot execute `is_admin()` or `is_business_member(uuid)`, and `viewer_blocked_with(uuid)` is absent. `20261022120000_restore_public_guest_reads.sql`, already present in deployed source, is absent from the production migration ledger. This is concrete deployment/schema mismatch evidence, not a Supabase latency diagnosis. The existing migration includes policy/helper fixes that avoid granting anonymous access to private block rows; **do not blindly follow database hints to grant SELECT on private tables**.

Exact backend release blocker: review/test the existing integration migration against the real staging schema and preserve its privacy/write-denial contracts (`scripts/verify-release-integration-sql.mjs`), reconcile the production migration ledger, then perform its approved controlled rollout and re-run these guest requests. The existing migration also includes unrelated inventory/admin behavior, so it was not edited, split, or applied under this performance-only change. No local PostgreSQL executable or staging database was available to rerun those SQL contracts in this session. Production requires this backend gate in addition to the client PR. Authenticated device freezes remain unverified.

Recovery CI on source `476e000` is **green**: [run 40054352950](https://github.com/daksh-07/-Everest-Local-App/actions/runs/40054352950). It independently repeats typecheck/lint, all unit tests, production web export, source/migration audits and focused browser regressions. The earlier run failed the original privileged fixture expectation; the fixture was corrected because customer workspace routing correctly redirects away from business Today. Local download of the CI artifact returned HTTP 403 from artifact storage; GitHub retains the uploaded artifact. No production promotion was performed. GitHub/Vercel automatically starts branch preview checks; those are not production releases or release approval.
