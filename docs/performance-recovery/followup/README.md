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
- Existing integration PostgreSQL suite: **21 passed**; existing quote-acceptance PostgreSQL transaction suite: **35 passed**, including races/rollback. These isolated fixtures are not live transactions.
- Existing client unit suite: **509 passed**; TypeScript and lint pass (0 errors / 11 existing warnings).
- Full local operations Chromium: **33 scenario groups, 336 layouts, zero page exceptions**, including Live reconnection, stale data, offline recovery, acceptance-response recovery and business operational screens. These are intercepted API/auth fixtures, not real production transactions.
- Initial Live retry fixture now disables its realtime subscription and settles outstanding startup reads before testing the explicit button, then verifies a new status read. Separate tests still exercise automatic realtime recovery. The earlier detached-button failure was a fixture race; no Live functionality was removed or error suppressed.
- Recovery CI now executes the new guest suite and existing integration suite. Operations CI now runs for the actual deployed integration branch and checks both Chromium and WebKit.

## Remaining limits

Supabase staging-branch creation was attempted and rejected because this project's plan does not support branching. No plan upgrade was requested or performed. Local isolated SQL contracts and real read-only production checks were used instead. No issued staging-account Auth flows, real two-user messages/realtime or real transaction writes were performed. Physical Android/iOS and assistive-technology acceptance remain unavailable. Native bundle exports from the original recovery passed; no native binary release is part of this web recovery.

**Web/backend recovery is released. See the final release record below.** The reported whole-app freeze on affected real accounts/devices has not been independently reproduced; this work fixes the demonstrated permission failures, indefinite reads and delayed tab commits, and does not claim every possible incident scenario is resolved.

## Further verified profile/search recovery

Real product/profile/back navigation exposed an additional missing public-discovery migration. The unchanged, reviewed `20261018032359_phase5_public_discovery.sql` passed **28 PostgreSQL tests** and was applied as remote version **20261025084317**, name `phase5_public_discovery`. Source SHA-256: `50e021013bf44bdb715601a8b46e8d9add4736cee9cfb2578a78e268c77e581d`. It restores guest public search and grants only `service_id` / `instant_booking_enabled` on booking settings, with a guest SELECT policy. People/community search remains authenticated; operational settings and writes stay restricted. Pre-rollout catalog and targeted rollback SQL are included.

The server intentionally restricts follow state/count RPCs and membership/package reads to authenticated users. The business profile now checks the local session once, skips those requests for guests, and offers an explicit sign-in action for benefits. Signed-in community, saved state, counts and benefits reads are preserved; purchase handlers and payment configuration are unchanged. Local discovery regression passes **10 scenarios**, 96 loaded + 48 empty + 48 error layouts and 8 accessibility scans, with zero page errors, and explicitly asserts both guest request suppression and signed-in request preservation. Real product/profile/back navigation against production data through the candidate returns zero failed REST reads.

Final-source Android and iOS production bundles also export successfully; physical device and issued-account limits above still apply. Live's clock test now inspects its stable Notified metric: deliberately closed sockets may correctly switch the headline to reconnecting copy, even while the confirmed count is 2. An isolated reproduction in Chromium 156 confirmed this distinction and the expansion assertion passes. Geometry checks wait for the animated track to settle, retaining the original size/bounds assertions.

Read-only production EXPLAIN ANALYZE samples after repair: businesses planning 1.26 ms / execution 0.726 ms; posts planning 5.504 ms / execution 3.584 ms. These tiny current datasets do not establish scalability or device latency. No speculative index changes were applied.

## Final web release and post-deployment verification

PR [#112](https://github.com/daksh-07/-Everest-Local-App/pull/112) merged into the deployed integration branch as **ed013dec0e1a11ad628663bc0fd723a8600ce7ee**. Its tree is byte-identical to tested source **88628ebc6616c847f6502e937129d13aef3562d6**. All final web CI gates pass:

- [Recovery + SQL contracts](https://github.com/daksh-07/-Everest-Local-App/actions/runs/40178698334)
- [Live/business operations, Chromium and WebKit](https://github.com/daksh-07/-Everest-Local-App/actions/runs/40178698286)
- [Discovery/navigation/visual/typography, Chromium and WebKit](https://github.com/daksh-07/-Everest-Local-App/actions/runs/40178698333)

Vercel production deployment **dpl_q5PRacsE9dSYozLnXkVayvR8rWVA** is READY. [Everest Local](https://everest-local-app.vercel.app) serves `build-info.json` with the exact merge SHA and environment `production`. The production aliases point to this deployment. No payment-provider configuration was changed.

Post-deployment on the real public domain: Home/Explore and real product/business-profile/back navigation pass with zero failed REST reads and zero page exceptions. All ten explicit discovery endpoint probes return 200; guest follower/connection probes still expose zero rows. The synthetic authenticated/guest regression against the deployed bundle passes repeated/rapid tabs, held-read retry, offline/reconnect, customer access-error isolation and privileged fail-closed checks. These fixtures never issue real production transaction writes or use real user credentials. Raw JSON and CI snapshots are in `release/`.

Real guest browser URL transitions after release: **66–109 ms**, median **79.5 ms**, versus **309–333 ms**, median **318.5 ms**, with the previous client after the first backend repair. Linux Chromium 154.0.8037.57, 390×844 ordinary desktop viewport, four transitions per run, real public backend. Cold UI was 1596 ms in the post-release sample; no startup gain is asserted. Synthetic authenticated post-release URL median is 100 ms over 15 transitions (range 77–354 ms); first visits remain slower than warm transitions. This is route timing, not device paint/FPS measurement or a universal SLA.

This closes the demonstrated web/backend blockers and the failing Live test. Physical native-device/account acceptance and the originally reported affected-device freeze remain unverified; no native store binary was published. The final platform bundles export, but that is not native certification. Rollback web deployment: dpl_C5ZESeGs4Gg26MdFKoE7LGdqasjB / 651814d. Backend rollback scripts restore the captured prior permissions, including the old discovery failures; they do not remove migration history or customer data.
