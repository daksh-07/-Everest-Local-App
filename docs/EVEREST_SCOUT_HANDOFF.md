# Everest Local — continuation handoff

Continue the existing implementation. Do not restart the redesign or discard completed changes. The latest user explicitly requests a Scout to continue after two hours and adds typography as a fundamental identity requirement.

## Latest user direction (takes precedence)

- Minimal, clean, professional, premium but approachable; not a generic dashboard or decorative luxury site.
- **Beige, grey and black** are the preferred core palette. Red, blue and green are useful semantic combinations, not arbitrary decoration. A proposed charcoal-only primary action direction was superseded by this preference.
- **Bricolage Grotesque** for Home hero, screen/important section headings, marketplace discovery, selected business/product names, Business Today headings, empty-state headlines and selective brand moments. Prefer 500/600/700; start most headings at 600, hero at 700. Do not put this face in message bubbles or every piece of text.
- **Inter** for body, navigation, buttons, search/form controls, chat, descriptions, prices, booking, CRM, orders, settings and metadata. Use actual 400/500/600/700 faces and tabular numerals for money/time/changing operational numbers.
- Suggested scale: hero 32–36; screen 28–32; section 20–24; card 16–18; body 15–16; button 14–16; support 13–14; metadata 12–13. Refine with real mobile captures, long titles/messages/prices and text scaling. Avoid everything bold, cramped small tracking and excessive uppercase.
- Source licensed font files from [Bricolage upstream](https://github.com/ateliertriay/bricolage) and [Inter upstream](https://github.com/rsms/inter) or authoritative distributions. Read actual licenses, retain notices, verify names/weights/glyph coverage. Bundle/self-host only used weights. Use [Expo SDK 54 font guidance](https://docs.expo.dev/versions/v54.0.0/sdk/font/), native embedding where appropriate, stable web loading/fallbacks. Avoid unsupported variable axes and synthetic native weights. No third general-purpose font. Check ₹, Australian accents and system fallback for non-Latin Indian scripts; do not claim glyph/device coverage without testing.
- Build centralized typography tokens. Compare current and proposed **actual Everest screens**: Home, Search/marketplace, Business Profile, Product Detail, Chat, Business Today. Label any controlled fixture data explicitly. Never fabricate listings/reviews/availability/payments as reality.
- Keep the shipped modern chat foundation; change typography without rebuilding verified interaction logic. Preserve splash/startup behavior and accessibility scaling.

## Repository and delivery state

- Repository: https://github.com/daksh-07/-Everest-Local-App
- Production: https://everest-local-app.vercel.app/
- Local checkout (if this executor persists): `/workspace/everest-local`.
- Active feature branch: `codex/customer-discovery-2026-10-12`, **PR #99**, now based on `main`.
- PR #98 (`codex/experience-foundation-2026-10-12`, head `5f21d570f7633ec8d4300de03f7579b945521e6d`) **merged** using a merge commit, preserving ancestry. Main merge SHA: `e3f8761e7d5b4dd62cec652b2b063fc6615034a8`, merged at 15:45:55 UTC on 12 October.
- Release A production is now verified: `/build-info.json` reports `e3f8761e7d5b4dd62cec652b2b063fc6615034a8` and the production Home navigation/appearance/gesture suite passed. Recheck production and PR #99 before resuming.
- Last completed #99 implementation/QA head before this handoff: `1a55dc4adfab716f702c156c747f625edbaf0548`. Subsequent commits `3823742`/`1a55dc4` after `b855878` only refined QA/docs; no app runtime difference existed then.
- This handoff commit adds a small shared beige palette refinement in `lib/theme.tsx` (light `brand #D0BFA6`, dark `brand #D8C5A7`, charcoal `onBrand`) and records the unfinished typography directive. **Superseded on 13 October:** licensed static font assets, Expo embedding, web loading, typography roles and accessible beige foregrounds are now implemented. See `docs/experience-v2-typography.md`; do not repeat the font build from scratch.
- #99 is still open. Do not merge it before typography, final checks, hosted preview validation and exact production verification. New user typography scope supersedes the earlier plan to release the discovery-only state immediately.

## Working improvements already implemented

- Hidden Explore no longer fetches feed/media/engagement at Home startup or records offscreen views.
- My Everest loads when visible; retained Messages polling stops behind other routes while thread/optimistic state stays intact.
- Pager starts on horizontal recognition, mounts destination windows after settlement, retains scenes/scroll state and reapplies browser inert state.
- Home service intents precede community content; all eight categories visible early. Compact 320 px quote/Live actions, readable Activity tab label, truthful business/product discovery labels, no Home/Search assistant overlay.
- Search has useful blank categories/quote entry, back/clear controls, selected-tab ARIA, readable flat rows, immediate generation invalidation plus abortSignal, honest current guest-permission guidance and retry, query preservation on account entry and reduced-motion modals.
- Existing stale OAuth test was corrected to check the actual server CRM permission RPC at initiation and callback, plus service-role-only grant/revocation. No authorization policy or function was changed.

## Evidence and checks

- Measured A: Home REST startup reads **20 → 6** in three comparable runs; DOM nodes **302 → 226**. Median time to Home controls **580 → 583 ms**: unchanged, not faster. Initial bundle execution still causes long tasks. No 60 fps/native performance claim.
- Measured B: category heading y **881 → 348** at 390 × 844, **533 px earlier**. No conversion improvement claimed.
- Last complete suite: **410 passed / 0 failed**; typecheck, web export, static audit (648 files / 96 routes), migration audit (235 migrations) passed. Lint has **0 errors / 12 existing warnings**, no new warnings. Exact-head GitHub Expo Doctor: **18/18 passed**; local remote metadata checks initially failed due this executor's networking.
- CI for #99 head `1a55dc4`: https://github.com/daksh-07/-Everest-Local-App/actions/runs/38271533722 — quality, Chromium and WebKit all passed. #98 mobile/function/WebKit-chat CI passed.
- Home and Search each passed **42 width/mode/theme combinations** per Chromium/WebKit plus navigation, vertical/horizontal gestures, reduced motion, delayed old search during debounce, clear, empty, permission and network failure/retry states. No physical device/simulator/VoiceOver/TalkBack or authenticated customer/provider end-to-end coverage.
- Browser test scripts: `scripts/verify-discovery-foundation.mjs`, `scripts/verify-search-discovery.mjs`.
- WebKit automation mouse steps were fast enough to trigger the existing legitimate **two-page flick**, taking a guest to Activity/auth. One-page test now uses a controlled 300 ms gesture; thresholds/springs were not changed to satisfy it.
- Capture matrix must **wait for responsive layout** when switching 1440 → 390 before screenshots; otherwise the screenshot can capture old desktop geometry despite interaction assertions passing. This is fixed in the capture script.
- Screenshots in `docs/experience-v2-evidence`; detailed source inventory/research/release records in `docs/experience-v2-*.md`. Some release-record deployment paragraphs predate hosted preview availability; update them to final verified state.

## Hosted previews and access

- A hosted preview (verified SHA `5f21d57`, environment preview): https://everest-local-app-git-codex-experience-e7069b-dakshgolani5-4632.vercel.app/
- B hosted preview (verified SHA **b855878**, environment preview): https://everest-local-app-git-codex-customer-d-44938d-dakshgolani5-4632.vercel.app/
- Both hosted Home suites passed; B hosted Search suite passed. B's current new typography/palette changes **will need a newer verified preview**, not the old screenshot/build.
- Vercel API deployment listing returned team-scope 403; scoped CLI lacked credentials. **Git integration subsequently produced public working previews**, so do not state that hosted previews are impossible. Use GitHub bot comments/deployment statuses and public build provenance; do not bypass denied scope or fabricate success.
- Correct project: `everest-local-app`, `prj_L57g1cxp3MPMWr0NuoJeh7P8sXHh`, team `dakshgolani5-4632` (`team_dsF0uzqRx5WaRhQlCndgzo0e`). Do not modify other projects or print credentials.
- `gh pr edit` currently fails with deprecated `projectCards` GraphQL error. Use the authorized GitHub REST API (`gh api .../pulls/99 --method PATCH`) for base/body updates; this successfully retargeted #99 to main.

## Immediate continuation sequence

1. Read current GitHub/production/branch state; preserve concurrent changes. Verify #98's actual production deployment first. Do not restart from old main or revert its validated work.
2. Typography implementation is complete; preserve it. Review licensed static font acquisition and Expo/web/native mapping only if a new defect is found. Inspect existing `app.json` / `app.config.js`, `app/_layout.tsx`, `app/+html.tsx`, `lib/theme.tsx`, shared UI and chat runtime. Existing SDK includes `expo-font ~14.0.12`; no Fraunces loading was found in current app surfaces. Do not add a new styling framework.
3. Typography tokens and functional/display roles are implemented in the active feature branch. Preserve them and keep subsequent changes cohesive/reviewable. Avoid React 19 `Text.defaultProps` hacks or overriding icon glyph fonts. Verify real weights and loading; do not create synthetic bold variants.
4. Capture the six requested surfaces before/after. Public Business/Product data and protected Chat/Today may require controlled fixtures/accounts; label fixtures and keep transactions inert. Current `app/chat-input-regression.tsx` is gated by `EXPO_PUBLIC_CHAT_WEBKIT_REGRESSION=1` and renders the actual Composer; preserve its safety gate.
5. Run existing checks and appropriate typography/font/contrast regressions, web/native config checks, browser visual loop. Use native/EAS only if actually available; do not claim native verification from browser emulation.
6. Push coherent commits to #99, get hosted preview, check actual font loading/geometry/interactions and exact SHA. User authorizes validated frontend releases, but no migration/payment/RLS/India rollout automatically. Merge validated frontend only when release conditions hold, then verify production domain/hash/interactions. Never equate push/merge with deployment.
7. Continue customer details/booking, then business operations, then coordinated marketplace/India work as real backend/access allows. Clearly report incomplete/blocked work.

## Backend and later-release limits

- #95 Home / #96 modern chat are merged baseline. Preserve them.
- #97 marketplace remains open/conflicting; requires guest-search and Live geographic/active-membership migrations plus coordinated Edge Functions/Stripe testing. Current guest `universal_search` returned code **42501** in a real production browser read. Do not enable it with a frontend permission bypass.
- Current service-role permission helper can evaluate an override before active membership; #97 addresses this existing boundary. No policy was changed here.
- Live's 45-second UI search expansion is distinct from reported 120-second dispatch offer deadline; no fictional provider count/ETA/acceptance.
- #77/#73 overlap already merged #79 work-first / #74 employee operations. Compare, do not blindly merge. #78/#80 security/privacy/reporting remain open.
- #93/#94 India are drafts; #94 actually contains a dispatch migration and two functions. Frontend market filtering/payment disablement alone is not server country isolation. No India payments enabled. No routing India transactions through AU Stripe.
- Business Today's source has broad CRM reads and embeds all messages in conversation queries. Profile actual owner/employee tasks before replacing this with bounded priority reads; use server permissions.

## Tooling if the same executor survives

- Playwright installed **outside app dependencies**: `/workspace/qa-tools/node_modules/playwright/index.mjs`; Chromium `/usr/bin/chromium`.
- Local SPA export served at `http://localhost:8083` by `/workspace/scratch/serve-export.py`; `/workspace/scratch/everest-baseline-dist` at 8081 preserves baseline.
- Local WebKit initially lacked system packages. Missing Debian libraries were extracted to private tooling and copied into the Playwright browser's private WPE sys/lib. Local launch uses `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` because registry probing cannot see private libs; actual browser rendered and all assertions ran. CI installs normal system prerequisites. This is tooling only, not an application dependency or skipped UI test.
- `/workspace/scratch/everest-qa`: local, hosted and WebKit captures/measurements. Export ZIP and delivery scratch notes exist but identify earlier head and must be regenerated after typography.
- Existing postinstall creates 96 legacy migration symlinks for tests. They are locally excluded with exact paths in `.git/info/exclude`; do not commit or delete canonical migrations. `npm ci` recreates them in a fresh checkout.
- Native device/emulator/EAS/Xcode command availability was not found in this executor. No auth/staging account credentials were supplied. Never ask for secret values in chat or expose them in logs/artifacts.

## 13 October continuation update

Frontend typography/palette implementation commits: `12dc93a`, `b3ca6f9`, `5961abd`. Latest code head will be superseded by evidence/QA documentation commits. Functional Text/TextInput imports now use shared, ref-preserving wrappers across app screens; icon glyph fonts remain untouched. Both browsers passed 84 typography layouts; Node suite is 413 passed, 0 failed. All selected text/semantic tokens meet AA on standard surfaces. Isolated iOS/Android font prebuild passed; real device rendering remains unverified. Hosted branch preview reports `5961abd` and Home/Search interactions passed. Check final CI/production rather than assuming this early head is the final release.

The explicitly requested continuation scout was created successfully, task ID `6acdb270492c8191857b7f50c546e067`, one-time schedule `2026-10-13 06:24:16 UTC`. Read current main/PR #99 first and do not duplicate a merged release. Start remaining work with customer details/booking and bounded business operations, retaining backend/payment/country gates.

## Final frontend delivery update

PR #99 merged on 13 October as `793e10d91c01d0e250395f117b9a61b71f78ca77`. Its exact head `bf2fc35` passed every relevant CI gate, including actual Android release AAB compilation and Expo Doctor. Production public metadata reports the merge commit and Home/Search production interaction checks passed. Do not rebuild typography. A small follow-up branch `codex/tinted-surface-aa-2026-10-13` fixes accent/muted text on accentSoft surfaces and strengthens waiting for the actual loaded Today heading (rather than its duplicate tab label). Verify that follow-up’s current PR/production state before new work. The next substantive scope remains authenticated booking/customer detail and bounded Business Today queries, then marketplace/India backend coordination.
