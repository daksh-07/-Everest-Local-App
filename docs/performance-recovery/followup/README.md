# Recovery completion — 25 October 2026

This supersedes the backend and Live-runner blockers in the original 24 October report. The original logs remain historical evidence.

## Completed production backend repair

The unchanged, reviewed `supabase/migrations/20261022120000_restore_public_guest_reads.sql` was applied through Supabase's migration API after isolated PostgreSQL verification and inspection of live helper definitions, policies, table privileges and RLS flags. Source SHA-256: `8f869f2529426071604bf0aea5275594448810c2b6c01fa15cb492118583d624`.

Supabase records this rollout as version **20261025083139**, name `restore_public_guest_reads`. The API assigns the rollout timestamp; this maps to the existing source migration above. No blanket migration push or history rewrite was performed. Future migration reconciliation must use this name/hash mapping rather than assuming the source timestamp is the remote version. Replay is tested as idempotent.

Changes restore existing public discovery reads and use a viewer-scoped block helper. Private blocks are not granted to guests. The helper can answer only for the current viewer, not arbitrary user pairs. Published/visibility/active-business/verification predicates remain enforced; writes, payments, commissions, settlement, quote acceptance and dispatch functions are unchanged. All touched tables already had RLS enabled and retain it.

Read-only post-rollout checks:

- All ten public endpoint probes return **200**: businesses, categories, services, products, posts, media, comments, reactions, verified work and Shop RPC. Zero rows for services/verified-work is a successful empty result, not proof of a populated catalog.
- Guest follows and connections return zero private rows; direct block-table SELECT and stock UPDATE remain ungranted. Admin/member helper results are false for guests, and `is_admin_identity` remains unavailable to them.
- Real public Home/Explore navigation produces zero failing REST reads and zero page exceptions (Chromium 154, 390×844 desktop viewport). Before the repair, these reads returned 401/42501. After repair and before client release: Home UI 1133 ms; tab URL changes 309–333 ms. These are single-run browser timings, not device paint metrics.
- Security advisor counts: existing no-policy tables 23 and leaked-password notice 1 are unchanged. Executable SECURITY DEFINER notices increase anon 5→8 / authenticated 221→222 for the deliberately granted is_admin, is_business_member and new viewer-scoped block helper. These grants were reviewed and covered by negative access tests; no general PUBLIC execute was added.

`../production-policy-baseline.json` captures pre-rollout catalog definitions/ACLs only, without customer rows. `../guest-read-rollback.sql` restores the exact prior SELECT policies and anon grants if needed; it intentionally restores the old discovery failures. It does not delete migration history or alter data. The exact migration's transaction rollback and replay are exercised locally. The generated production-specific rollback file itself has not been applied to production.

## Verification completed

- New guest-only PostgreSQL suite: **22 passed**, including initial failure reproduction, guest/private stock boundaries, hidden/follower post/media denial, graph privacy, guest write denial, blocks in both directions, rollback and repeated migration replay. Uses PostgreSQL 17 in local Docker; JIT disabled in the small fixture so synthetic cardinality estimates do not dominate test runtime.
- Existing integration PostgreSQL suite: **21 passed**.
- Existing client unit suite: **509 passed**; TypeScript and lint pass (0 errors / 11 existing warnings).
- Full local operations Chromium: **33 scenario groups, 336 layouts, zero page exceptions**, including Live reconnection, stale data, offline recovery, acceptance-response recovery and business operational screens. These are intercepted API/auth fixtures, not real production transactions.
- Initial Live retry fixture now disables its realtime subscription and settles outstanding startup reads before testing the explicit button, then verifies a new status read. Separate tests still exercise automatic realtime recovery. The earlier detached-button failure was a fixture race; no Live functionality was removed or error suppressed.
- Recovery CI now executes the new guest suite and existing integration suite. Operations CI now runs for the actual deployed integration branch and checks both Chromium and WebKit.

## Remaining limits

Supabase staging-branch creation was attempted and rejected because this project's plan does not support branching. No plan upgrade was requested or performed. Local isolated SQL contracts and real read-only production checks were used instead. No issued staging-account Auth flows, real two-user messages/realtime or real transaction writes were performed. Physical Android/iOS and assistive-technology acceptance remain unavailable. Native bundle exports from the original recovery passed; no native binary release is part of this web recovery.

Web release status and final CI/deployment links are recorded separately after validation completes. The reported whole-app freeze on affected real accounts/devices has not been independently reproduced; this work fixes the demonstrated permission failures, indefinite reads and delayed tab commits, and does not claim every possible incident scenario is resolved.
