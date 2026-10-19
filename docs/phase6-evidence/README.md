# Phase 6 — backend correctness and launch hardening

**Recommendation: NO-GO for the next production release.** The local corrections and review branch are complete. Real staging lifecycle/realtime verification, migration-history reconciliation and physical-device acceptance remain release gates. This report does not label fixtures as staging or production validation.

Review PR: [#110](https://github.com/daksh-07/-Everest-Local-App/pull/110). Base/main/production verified as `95b8d489c98109717bcb8d6ef53d54674c4b5ab7`; #108 and #109 are merged. #107 is open at `068566b`, reconciled here with only its `vercel.json` conflict resolved. #97 remains open at `afbaa855`; neither its geographic migration nor its broad guest-search migration was copied. No payment, pricing, commission, checkout, messaging or booking behavior was changed beyond #107's recovery integration; existing payment-bearing SQL was tested unchanged with controlled fixture dependencies.

## Verified defects and corrections

| Defect reproduced locally | Before | Corrected behavior / evidence |
| --- | --- | --- |
| Named service-area OR bypasses both geographic limits | Sydney business receives Melbourne 3km wave | LOCAL requires coordinates and existing wave/provider radius limits; nearby named areas still work; REMOTE remains global |
| Future `available_from` ignored | AVAILABLE_NOW receives immediate offers before its start | Inclusive start plus existing unexpired end required |
| Removed-member unfinished assignment excludes business | Eligible business receives no offer | Only ACTIVE member unfinished assignments exclude it |
| Live offer leaves request MATCHING | Existing quote API's QUOTING guard rejects the state | A wave that creates offers transitions OPEN/MATCHING to QUOTING; terminal/no-provider state is preserved |
| Direct comment hide fails PostgreSQL RLS | 42501 when new HIDDEN row fails visible-only read policy | Boolean-only `hide_post_comment` RPC authorizes comment author/post author/real administrator without exposing hidden rows or loosening SELECT policies |
| Background Live status read erases failed cancellation feedback | Healthy read clears the shared error state | Separate action feedback persists until the user checks the request or starts another action; no automatic cancellation retry |
| Production guest discovery unavailable | Read-only current API probes return 401 / 42501 for search, business read and booking affordance | Exact reviewed #107 migration passes local identity/permission tests; **not applied to production** |

The installed production Live function contains the first three problematic predicates. No synthetic matching/writes were run there. See [checkpoint A](checkpoint-a.md), [matching rules](checkpoint-b.md), [discovery reconciliation](checkpoint-c.md), [additional backend findings](checkpoint-d-progress.md), [read-only API results](production-read-only.json) and [catalog fingerprints](catalog-fingerprints.json).

## Exact local results

| Check | Pass | Fail | Scope |
| --- | ---: | ---: | --- |
| Original matching regressions before fix | 0 | 3 | Exact previous wave SQL, synthetic fixtures |
| Expanded matching after final migrations | 33 | 0 | PostgreSQL 17.6 and independently PGlite |
| Live quote-state/idempotency/ownership/address contracts before / after | 4 / 5 | 1 / 0 | Actual start/release SQL; quote guard is synthetic, not full payment API |
| Discovery permission matrix | 28 | 0 | PostgreSQL 17.6 and PGlite; guest/customer/provider/staff/admin synthetic identities |
| Comments RLS before / after | 7 / 11 | 1 / 0 | Exact policies, two identities/independent sessions, concurrent stale-edit guard, moderation/guest/private/disabled checks |
| Transaction contracts | 20 | 0 | Independent PostgreSQL sessions; provider acceptance, expired/offline/stale/unauthorized rejection, cancellation, quote acceptance and completion guards |
| Live action feedback before / after | 0 / 1 | 1 / 0 | Held status response; strengthened case passes within all 26 operational groups in Chromium 156 and WebKit after correction |
| Unit tests | 474 | 0 | Full repository suite, including remote-target rejection by destructive SQL fixtures |

TypeScript, lint (0 errors; 11 existing hook warnings), clean web export, static audit (767 source/config files, 96 routes) and migration audit (239 migrations) pass. No application dependency upgrade was made. [Machine-readable validation](validation.json) and [raw SQL reports](sql/) retain the case names and outcomes.

The transaction suite controls readiness/fee/authorization dependencies and starts from synthetic request/confirmed-booking fixtures. It verifies database locks/state invariants, not payment providers, a complete migrated production schema, issued Auth sessions, push delivery or the complete request-to-paid-booking path. Production function fingerprints match the tested customer acceptance/completion definitions; provider acceptance matches all 1,276 SQL body tokens despite formatting differences.

**Remaining transaction finding:** deterministically interleaving two customer quote decisions produces `40P01` because each quote is locked before the shared request. PostgreSQL aborts one transaction and exactly one booking survives. The one-booking invariant passes; smooth concurrency/error recovery does not. See [transactions.json](sql/transactions.json). The payment-bearing acceptance function is unchanged under the task's exclusions.

## Browser and mobile regression

| Suite | Chromium | WebKit | Accessibility per engine |
| --- | --- | --- | --- |
| Home, Search, Profiles, Business Today | 8 scenario groups; 224 layout/state combinations | Same | 8 scans; 0 violations |
| Live, Jobs, Calendar, Inbox, CRM, My Work, Availability | 26 groups; 392 combinations | Same | 28 full-document scans; 0 violations; old navigation allowlist removed |
| Comments | 11 groups; 98 combinations | Same | 2 dialog scans; 0 violations |
| Released messaging | — | 132 layout/interaction cases | Simulated visual-viewport keyboard transitions |
| Bookings | — | 12 loaded layouts plus loading/error/retry/empty/filter/enlarged-text checks | Keyboard focus and narrow-screen layout checks |

Widths: 320, 375, 390, 430, 768, 1024 and desktop 1280 for the principal suites. Light/dark, reduced/default motion, delayed/failed reads, retry, permission loss, offline/reconnection and keyboard/focus interactions are covered where applicable. Messaging/bookings additionally cover mobile and tablet widths through 1024. All final principal-suite reports record zero page errors. All writes/authentication/realtime transports in browser suites are fixtures. Raw final results: [Chromium](browser/chromium/) · [WebKit](browser/webkit/).

Failed preliminary attempts are not counted as passing: a shared-worktree Metro cache produced an empty route context until a clean export; fixture reloads interrupted late retained-screen reads in WebKit; and a held-map test initially released only one of multiple concurrent map requests. The fixture harness now settles tracked API reads, intercepts geocoding, initializes comment themes before loading, awaits rendered state and releases all held responses. Page-error and accessibility assertions remain enabled. A later Chromium CI run also exposed a pagination assertion that did not await its request and a real Live cancellation-feedback race; both have targeted regression corrections. The follow-up local run passes all 26 core operational groups in Chromium 156 and WebKit (zero page errors), and the corrected comments suite passes 11 groups/98 layouts in Chromium 156. See [follow-up regression evidence](browser/live-feedback/). TypeScript, lint, export and all 474 unit tests were repeated after the source fix. Final CI reruns these checks on the final source; CI status is available in PR #110 rather than inferred from local results.

Representative current screenshots:

- [Home 390](screenshots/home-light-390.png), [Home local retry](screenshots/home-retry.png), [Search retained results](screenshots/search-retained-error.png)
- [Profile partial recovery](screenshots/profile-partial-error.png), [Business Today partial recovery](screenshots/today-partial-error.png)
- [Live light](screenshots/live-light.png), [Live dark](screenshots/live-dark.png)
- [Comments light](screenshots/comments-light.png), [Comments dark](screenshots/comments-dark.png)
- [Bookings 320](screenshots/bookings-320-light.png), [booking error](screenshots/bookings-error.png)

Historical before/after UI comparisons remain in [Phase 5 evidence](../phase5-evidence/README.md), [Phase 5B evidence](../phase5b-evidence/README.md) and [comments evidence](../comments-evidence/README.md). Their dates/base SHAs remain historical, not relabelled as this release's live verification.

## Verification boundaries and remaining blockers

| Priority | Remaining blocker / action |
| --- | --- |
| **P0** | No separate accessible Supabase staging project or authorized customer/provider/staff test-account setup. Complete actual Auth/PostgREST/RLS, full lifecycle and multi-client Realtime/push tests; do not use production main as staging. |
| **P0** | Reconcile remote migration history, replay the full production schema in staging, rehearse rollback, review the four pending SQL files and obtain an explicit database release approval. The existing default branch record has historical MIGRATIONS_FAILED status; the focused fixtures do not certify full-schema replay. Guest discovery remains unavailable in production until authorized rollout. |
| **P1** | Resolve/review customer quote-decision lock ordering and lost-response recovery (`40P01`) in a separately authorized payment-bearing-function change. One-booking integrity is preserved in current local tests. |
| **P1** | Physical iOS/Android maps, actual system keyboards/IME, safe areas, VoiceOver/TalkBack and two real authenticated comment clients are unverified. Viewport/keyboard simulation and axe are not physical-device or screen-reader acceptance. |
| **P1** | Review managed security-advisor findings individually, including leaked-password protection and intentional public/authenticated privileged APIs. Do not broaden permissions or remove deny-by-default protections to silence notices. |
| **P2** | Review remote-service map language and provider location freshness/capacity semantics after the release gates; existing behavior was preserved. No cosmetic redesign is proposed. |

Verified **locally:** focused SQL/permission/concurrency contracts, units, exported-app browser interactions and accessibility/layout checks. Verified **against production read-only:** deployed SHA, merged PRs, function/ACL/catalog metadata, migration-history tail, advisors and anonymous API error status. Verified **in staging:** none. Verified **on physical devices:** none.

Safe rollout, post-migration checks and rollback are in [ROLLOUT.md](ROLLOUT.md). Exact resumption/runtime instructions are in [RESUME.md](RESUME.md). No production migration, transaction, automatic deployment or merge was performed.
