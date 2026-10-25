# Everest Local consolidation — 23 October 2026

**NO-GO — BLOCKERS REMAIN. Production deployment remains manual.**

Integration PR: [#111](https://github.com/daksh-07/-Everest-Local-App/pull/111), `integration/final-release-20261023`. Main remains `2a20c7388cd76944b095557e2b1e47c6920ce97a`. Production build metadata still reports `95b8d489c98109717bcb8d6ef53d54674c4b5ab7`. No source merge URL exists for this session: the integration is deliberately draft and unmerged while mandatory gates remain blocked. No production deployment, alias/domain change, payment-handler change or production migration was performed.

The current engineering source checkpoint is `0cf82161a09739d2f60f436e4b2984277df3ecb4`; subsequent evidence/diagnostic commits must not be mistaken for a production release. The public Vercel preview is built automatically from the integration branch; it is not production or an isolated backend.

## Work completed

The nine Claude app/database commits were reconciled individually onto current main. Its final expo-asset bump was already implemented on main. Conflicts retain the newer independently recoverable Today/profile/search sections and the Phase 7 request-first quote acceptance/recovery implementation. Reporting, accessible controls, customer/business deep links, customer chat identities, read receipts, lazy product drafts, typed-address confirmation, guest cart/workspace guards and admin operations are preserved.

Additional repairs:

- Post reporting rejects unconfirmed RPC identifiers; moderation rejects zero-row post updates and false report-review results. Partial hide/report-close failures are described accurately. Reporting no longer promises permanent hiding or anonymity from moderators; session hiding is scoped to the viewer.
- Owner archive/delete controls from #60 now use confirmation and server-confirmed updates. Caption/comment-setting mutations also reject missing rows; sharing failures are caught.
- Home offers explicit Australian locality entry when GPS is unavailable. Empty input is validated, the selected area changes discovery, and guest selection never attempts a profile write. India activation remains blocked separately.
- Admin operations distinguish failed reads from empty queues, use an exact business-verification count, display capped reports as `50+`, and offer retries. Missing totals cannot become zero or an authorization denial. Driver grant review excludes the unused legacy verifier; the current credential/vehicle APIs remain authoritative.
- iOS CI enforces Xcode/iOS SDK 26 and compiles the actual app scheme for a release simulator target. Android continues to compile and inspect a release AAB. Expo's missing SDK 54 `expo-system-ui` module is installed and locked; both native prebuilds complete without the previous system-UI warning.
- Postinstall's 95 unique test-only migration aliases now have guarded, idempotent cleanup. Unknown files/symlinks are never overwritten. A duplicate mapping was removed. These aliases must never enter a migration deployment.

No payment providers, commissions, settlements, billing rules, payment Edge Functions or payment rails were changed. The payment/transaction rollout in #105 remains isolated and blocked.

## PR disposition

| PR | Disposition | Evidence / remaining condition |
| --- | --- | --- |
| [#2](https://github.com/daksh-07/-Everest-Local-App/pull/2) | **Superseded; closed** | Main already has customer-scoped saved APIs, Saved/Account entry points and business/product actions. |
| [#4](https://github.com/daksh-07/-Everest-Local-App/pull/4) | **Superseded; closed** | ABR Edge Function is identical; canonical migrations and current clients already contain automation, revalidation and tighter grants. No old timestamps imported. |
| [#5](https://github.com/daksh-07/-Everest-Local-App/pull/5) | **Blocked; open** | Explicit preview-only/do-not-merge branch. Older UI is largely superseded; its dispatch-contract/payment-return subset needs separate staging reconciliation. |
| [#8](https://github.com/daksh-07/-Everest-Local-App/pull/8) | **Superseded; closed** | Current grouped Settings already covers identity, appearance, privacy, sessions, support and deletion. |
| [#60](https://github.com/daksh-07/-Everest-Local-App/pull/60) | **Incorporated on integration; open** | Confirmed owner actions added; current Account/Archive replace a duplicate My Posts route. Existing ownership/RBAC policies retained; old policies not imported. Await #111 gates/merge. |
| [#73](https://github.com/daksh-07/-Everest-Local-App/pull/73) | **Superseded; closed** | Five original migration bodies have identical SQL tokens under canonical timestamps. Other bodies add job-record prerequisites/workspace context and correct the booking-based assignment join. Current RBAC/queues retained. |
| [#77](https://github.com/daksh-07/-Everest-Local-App/pull/77) | **Superseded; closed** | Main already has jobs-first manager navigation, workforce navigation and secondary CRM, with newer section recovery. |
| [#78](https://github.com/daksh-07/-Everest-Local-App/pull/78) | **Superseded; closed** | Main revokes actor helper execution from all clients. The older PR's anonymous/authenticated grants would reopen probing. |
| [#80](https://github.com/daksh-07/-Everest-Local-App/pull/80) | **Incorporated on integration; open** | Reporting SQL already exists in main/production. Reporting UI, public Support and a stronger toolchain/compile gate are incorporated. Await #111 gates/merge. |
| [#93](https://github.com/daksh-07/-Everest-Local-App/pull/93) | **Blocked draft; open** | India routing/localization depends on complete market isolation and #94/#101 acceptance. No India activation imported. |
| [#94](https://github.com/daksh-07/-Everest-Local-App/pull/94) | **Blocked draft; open** | Provider/market/currency/dispatch infrastructure lacks genuine AU/IN staging acceptance and server-side market stamping before pagination. No provider/payment abstraction imported. |
| [#97](https://github.com/daksh-07/-Everest-Local-App/pull/97) | **Partially incorporated; blocked/open** | Newer main already contains reviewed Live/discovery corrections. Manual Australian locality selection is incorporated here. Country-aware/India and payment-return portions remain separate; old duplicate migrations not imported. |
| [#101](https://github.com/daksh-07/-Everest-Local-App/pull/101) | **Blocked draft; open** | AU-only billing guard changes depend on #94 and real staging validation of every covered endpoint. No live payment implementation changed. |
| [#105](https://github.com/daksh-07/-Everest-Local-App/pull/105) | **Blocked; open** | Explicit payment/inventory/checkout rollout prerequisites and real staging acceptance remain unmet. Earlier UI-only fixes are already on main through #106. No transaction SQL or payment handler imported. |
| [#111](https://github.com/daksh-07/-Everest-Local-App/pull/111) | **Draft integration; blocked/open** | Contains the reviewed consolidation; no merge until its gates pass. |

[PR commits, changed files and initial CI](pr-review-inputs.json) · [initial open PRs](open-prs-at-start.json) · [all inspected branches](branches-at-start.json).

126 remote branch refs were catalogued, including the new integration branch; 91 are outside main's direct ancestry. This includes older squash-merged histories and does not mean 91 active, missing features. Each ref records its SHA, last commit date and open PR association. The required Claude branch is recorded at `da5e2c176e4dd744b0c4b7d3e616c1f9bdaff71d`; it was based on production's older `95b8d489`, so replacing main wholesale would lose Phase 5–7 work and deployment separation.

## Verification and scope

Current local results: **506 unit/security tests passed, 0 failed; 133 PostgreSQL contracts passed, 0 failed; 61 PGlite contracts passed, 0 failed.** Expo Doctor: **18/18**. TypeScript passes; ESLint has **0 errors / 11 existing warnings**. Dependency installation, production-style web export, static route/security audit and canonical migration audit pass. **Chromium and WebKit each pass 58 scenario groups, 816 responsive checks and 38 axe scans, with zero page errors/violations.** On the engineering commit, all **17 checks pass**, and Supabase Preview is **SKIPPED**. Android release AAB compilation/manifest verification and the Xcode 26+/iOS release simulator build both pass. Physical device/store-signing acceptance remains blocked. See [validation summary](evidence/validation-summary.json), [exact engineering CI](evidence/ci-source-0cf8216.json) and [native jobs](evidence/native-ci-source-0cf8216.json).

The 14 new mutation cases reproduced **13 failures before correction** and pass afterward. Alias cleanup reproduced a duplicate mapping during development; the canonical mapping is now unique and all four filesystem safety cases pass. PostgreSQL includes 33 matching, 5 lifecycle, 28 discovery/permission, 11 moderation and 35 acceptance/transaction cases, plus 21 new guest/block/identity/admin/ACL/rollback contracts. PGlite independently repeats matching and discovery. The new grants/identity tests use controlled schemas and some controlled dependencies; they do not certify real Auth/MFA, driver approval, PostgREST or complete-schema behavior.

Browser tests run the real exported screens with intercepted API/Auth/realtime traffic. They cover widths 320/375/390/430/768/1024/1280/1440, LIGHT and DARK (DARK's canvas is true black), default/reduced motion, overflow, keyboard focus, touch-calendar interactions, retries, empty states and axe A/AA checks. The app has two explicit palettes; true black is its DARK palette, not a third theme preference. Existing CI also runs search/discovery, public-profile/job, visual/typography and WebKit input regressions. Mocked sessions are never presented as real customer/provider acceptance.

Initial local runs had Chromium network and WebKit access-control page errors while mutable export testing was underway. They remain failed evidence. Diagnostic capture was strengthened, and all suites pass when rerun against the immutable `0cf82161` export; no error allowlist, assertion suppression or security bypass was added. The local WebKit runtime required user-space system libraries and a host-loader validation override because its linker cache cannot see them; the actual engine launched and ran tests. CI installs host dependencies normally without that override.

[Coverage and outstanding acceptance](COVERAGE.md) · [migration inventory](migration-inventory.json) · [migration order, rollback and manual release](RELEASE.md).

## Mandatory blockers

1. **Genuine isolated staging:** Supabase branch creation returned `PaymentRequiredException: Branching is supported only on the Pro plan or above`. No branch or production schema was changed. Local PostgreSQL provides focused isolation only. Obtain a separate staging project/plan and real customer/provider/unverified/staff/removed-staff/password+MFA-admin sessions.
2. **Full schema and recovery:** 4 remote-only migration entries, 209 unverified source representations, full baseline replay, verified backups/PITR and a complete restore/rollback/reapply rehearsal remain unverified. The local transactional rollback tests are not that rehearsal.
3. **Actual backend acceptance:** issued Auth/PostgREST/RLS cross-account journeys, two-session realtime, booking/quote retries and concurrency through the full trigger graph, moderation and order/pickup/delivery/cancellation must run in staging. No synthetic bookings/payments were sent to production.
4. **Security review:** the read-only advisor reports 23 RLS-without-policy INFO findings, 5 anonymous and 221 authenticated SECURITY DEFINER warnings, and leaked-password protection disabled. Deny-by-default tables/intentional APIs need individual sign-off. A fresh catalog query found no public table reachable by anon/authenticated with RLS disabled; that does not certify every policy/function.
5. **Native/device acceptance:** physical iOS/Android maps/location, real push, keyboard/IME, safe areas, VoiceOver/TalkBack, reconnection and payment-return behavior remain BLOCKED. Remote compile/configuration evidence is separate from device acceptance.
6. **Deployment separation/operator access:** main's `git.deploymentEnabled.main=false` matches Vercel's official schema and workflows contain no production deployment command. Vercel project-settings inspection returned team-scoped 403; management-side separation/rollback access is not certified. Verify Supabase Git integration cannot auto-apply production SQL on merge as well. No source merge until this is resolved.

No production migration has been approved. No production release is authorized by this report. Main is intentionally unchanged until mandatory validation and source-merge gates permit consolidation.
