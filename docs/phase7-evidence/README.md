# Phase 7 — transaction safety and production release gate

**Decision: NO-GO for production.** The customer quote deadlock and client uncertainty recovery are implemented and verified locally. Staging, complete schema/restore rehearsal, native acceptance and deployment access remain blocked. No production migration, synthetic transaction, merge or deployment occurred.

Review package remains [PR #110](https://github.com/daksh-07/-Everest-Local-App/pull/110), branch `codex/phase6-backend-hardening`. No overlapping PR. Verified main/public production remain `95b8d489c98109717bcb8d6ef53d54674c4b5ab7`; #108/#109 remain released. Phase 6's original 12 green jobs and evidence at `152188f` remain historical; final Phase 7 CI is linked in the PR, not inferred from those runs.

## Completed checkpoints

| Checkpoint | Commit | Concrete result |
| --- | --- | --- |
| A audit / red test | `a1c437c` | Current GitHub/public build/Supabase state; strengthened unmodified-API deadlock regression |
| B correction | `3285126` | Minimal request-first acceptance migration, ownership/request revalidation, client reconciliation and 11 recovery tests |
| C reconciliation / verification | `4343697` | Complete version/name inventory, catalog/ACL baseline, 35 transaction checks, both entry-point browser recovery, staged setup and rollback package |
| D available acceptance | Final evidence commit in PR | 485 unit tests; Chromium/WebKit each 33 core scenario groups, zero page errors; full final CI requested on the release source |
| E release decision | This report | NO-GO; no production mutation. Exact missing gates below |

## Deadlock cause and correction

Each old customer decision locked its own quote, then the shared request. The winner next tried to decline the other quote, which the waiting decision already held: quote A → request → quote B → request cycle. The strengthened test holds only the common request externally and queues both real unmodified APIs; it does not prelock quote rows outside their execution path.

The new migration resolves the request through an unlocked owned-quote lookup, locks the request first, then locks and revalidates the selected quote's owner AND request. It preserves all state, expiry, fee, deposit, payment-readiness, booking and notification behavior after that block byte for byte. No Stripe configuration, payment amount, commission or settlement logic changed. Existing quote-write privileges require the authoritative authenticated RPC.

Both Live and Quotes now check existing authorized request booking state before submitting. Acceptance is a single bounded mutation. A failed/lost/missing response triggers a bounded read reconciliation; either competing quote's committed booking can be recovered. If still unknown, Check bookings navigates to authoritative reads, without automatically replaying the write. Quotes has an immediate ref lock and action feedback separated from read refreshes. Existing timeout utilities are reused.

[Isolated SQL review / complete traced trigger path](ACCEPTANCE-SQL-REVIEW.md) · [Before regression](before-regression.json) · [After transactions](after-transactions.json).

## Exact local verification

| Check | Passed | Failed | Scope |
| --- | ---: | ---: | --- |
| Strengthened concurrency regression BEFORE | 12 | 1 | 40P01 reproduced; one booking survived |
| Expanded transaction suite AFTER | 35 | 0 | PostgreSQL 17.6; real fee/readiness helpers and actual Live/dispatch lifecycle triggers; controlled driver/membership dependencies |
| Included concurrent runs | 50 | 0 | 20 gated different-quote, 10 same-quote, 20 cancellation races; no deadlock and at most one booking |
| Client recovery unit cases | 11 | 0 | Prior commit, lost response, other winner, failed preflight, empty confirmation, unavailable verification, bounded hung operation and late result |
| Entire unit suite | 485 | 0 | Includes the 11 recovery tests |
| Chromium operational core | 33 | 0 | Seven new recovery groups plus existing flows; zero page errors |
| WebKit operational core | 33 | 0 | Same cases; zero page errors |

TypeScript, export, lint (0 errors / 11 existing warnings), static audit (780 source/config files, 96 routes) and migration audit (240 tracked migrations) pass. Full relevant CI repeats SQL/discovery/comments/operations/quality on the final source. See PR checks for final job results. Browser API/Auth/realtime traffic is intercepted; these are not live staging sessions.

SQL additionally verifies payment-required/PENDING_PAYMENT and fee/deposit invariants; changed ownership/request after waiting; readiness denial; stale/expired/unauthorized choices; cancelled request; precommit disconnect rollback; SQL timeout with full rollback; lost-response authoritative read; anonymous EXECUTE and direct quote-write denial. Focused acceptance rollback/reapply restores the captured old definition and execution ACL without changing booking rows. This is not a complete Supabase restore rehearsal.

The Phase 6 local permission/matching/comment evidence is retained (33 matching, 5 Live state, 28 permission and 11 comment checks); final CI reruns those plus the expanded 35 transaction checks: **112 PostgreSQL contracts**. PGlite independently repeats matching/discovery (61 cases). Its production read-only probes already showed guest discovery unavailable; those migrations remain unapplied.

Phase 6 full visual evidence spans 320/375/390/430/768/1024/1280, both themes and applicable reduced/default motion. Final CI repeats principal browser matrices (224 discovery, 392 operations, 98 comments per engine), accessibility, typography and booking regression. Native/device results are **unavailable**, not passed. Existing [screenshots and Safari/booking evidence](../phase6-evidence/README.md) remain identified as the earlier checkpoint.

Preliminary failures are not relabelled as passes: browser server startup was not ready on the first Chromium attempt; a new Quotes test initially used its visible label rather than accessible name; a cancellation fixture omitted the real Live lifecycle trigger; one trigger definition had different formatting but identical 197 SQL body tokens. These were corrected with actual state/trigger/token checks. Assertions and accessibility checks were not disabled.

## Migration and security findings

[Complete inventory](migration-inventory.json): 240 tracked files versus 239 remote entries; 235 version/name matches, 26 trimmed byte matches, 209 source representations/content unverified, 0 version/name collisions, five pending release migrations and four remote-only entries. No automatic reconciliation, reset, blanket push or repair was performed. [Detailed reconciliation](MIGRATIONS.md).

[Catalog baseline](catalog-baseline.json) captures changed-function definitions/ACLs/owners and relevant policies/privileges; other traced function definitions are fingerprinted. Production `hide_post_comment` is absent and must be present before its dependent frontend releases. Quote writes remain denied outside the authoritative RPC. Local guest/customer/provider/staff/admin permission fixtures are not real issued Auth sessions.

[Read-only advisor counts](security-advisors.json): 23 RLS-without-policy INFO, 5 anonymous and 221 authenticated SECURITY DEFINER warnings, and leaked-password protection disabled. Review intentional APIs and deny-by-default tables individually. No broad grants, RLS bypass or production Auth change was made. References: [privileged APIs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Remaining mandatory blockers

| Priority | Missing gate / precise next action |
| --- | --- |
| **P0** | Isolated accessible staging project, approved secret-manager connection and real customer/provider/unverified/staff/removed-staff/password+MFA-admin accounts. Follow [STAGING.md](STAGING.md); no production synthetic tests. |
| **P0** | Full production-schema replay, four remote-only migration sources, 209 unverified source representations, independent acceptance-SQL sign-off, usable backup/PITR and full rollback/reapply rehearsal. Focused local fixtures do not certify this. |
| **P0** | Actual Auth/PostgREST/RLS lifecycle and two-session realtime comments/moderation, geographic/concurrent/offline acceptance through the complete trigger and operational graph. Current result: BLOCKED. |
| **P0 before deployment** | Vercel deployment scope listing returns 403; restore deployment/monitoring/rollback operator access. Public production SHA is verifiable, but management access is not. |
| **P1 required acceptance** | Physical iOS/Android maps/location permissions/refresh, keyboards/IME/navigation/safe areas, true-black theme, VoiceOver/TalkBack and touch targets. No devices, adb or xcrun are available. |
| **P1** | Security-advisor review and Auth password-protection decision; do not silence warnings by expanding access. |
| **P2 deferred** | Location freshness, capacity semantics and remote map language; no cosmetic work started. |

**Verified locally:** source, isolated SQL concurrency/permissions/rollback contracts and browser fixtures. **Verified production read-only:** current SHA, PR state, project/branch/history/catalog/ACL/advisors. **Verified in staging:** none. **Verified on physical devices:** none. **Production released:** no.

[Concrete rollout and rollback checklist](ROLLOUT.md) · [Persistent resumption instructions](RESUME.md). Request explicit production release approval only after every mandatory gate has evidence; do not merge #110 while blocked.
