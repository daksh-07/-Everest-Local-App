# Final delivery report — design transformation (passes 1 and 2)

Branch `design/everest-transformation-2026-10`, based on `main` @ `a8490d7`. Not deployed to production.

## Current continuation — 16 October 2026

Resumed from Claude's committed head `c705947`, with a clean checkout. Verified the colour identity (`28098c3`–`15a1caf`), Business Job (`03693b3`), CRM customer (`239ea3b`), storefront (`a03a14b`), public profile (`a03b863`), accessibility (`a02e7b8`), creation (`dce179b`) and Clips overlap (`c705947`) commits. Their work and phase-3 evidence are preserved. The older phase-2 totals below are historical; the route checklist is now reconciled with phase 3.

Shopping continuation:
- Cart is an ordered review: item totals and quantity controls → fulfilment radio choices and address → subtotal and secure checkout. Uses the existing checkout/idempotency path, with the existing minimum address length reflected in button readiness.
- Orders separate in-progress purchases from history. Guidance explains payment verification, acceptance, preparation, pickup, dispatch and terminal states. Explicit refresh works on web as well as pull-to-refresh on mobile. Payment and delivery status remain independent; stale delivery data is labelled.
- Product: fulfilment before quantity, compact missing-photo state, accessible variant/photo selectors, quantity-aware purchase total. Sold-out defaults and silent quantity truncation are fixed.
- Correct persisted fulfilment labels and semantic warning badges. Long status labels wrap.
- No new backend queries, mutations, migrations, RLS rules, Stripe paths or dispatch transitions.
- Evidence: `evidence/phase4/shopping/`, including mixed-business/unavailable carts, address validation, order history and delivery failures. Inert fixtures, not real-backend verification.
- Validation: 457 tests passing; typecheck passing; lint 0 errors / 12 existing warnings. Browser results are recorded with the evidence and PR update.

The transformation is **not complete**. Remaining routes stay explicitly marked swept/refined in the checklist. Real-backend and physical-device journeys require an authorised non-production environment and test accounts; no such credentials are configured in this workspace. No merge or production deployment is authorised.

## Phase 2 summary (PR #104 continuation)

Phase 2 took the remaining surfaces from "swept" to redesigned where the work mattered most, and fixed the behavioural bugs found on the way (BF-20 to BF-40 in `bug-fix-register.md`).

- **Ask Everest**: the draggable floating button is gone. It is a 44pt header action on Home (search bar), Account, Business Today and My work, so it never overlaps content.
- **Messages**: compact header, Messages-style rows, legible controls; the Live pill never covers an open thread.
- **Requests, quotes, bookings, orders**: shared `ScreenHeader` with a real back fallback; formatted money and dates; quote badges only on evidence; **accepting a quote and cancelling a live request now confirm first**.
- **Everest Live**: confirmation sheets; reconnecting keeps the last confirmed server status; web map markers actually render; tiles only from a configured provider with attribution.
- **Shopping**: sold-out options say so in text; low stock is not shown in the success colour; money formatted once.
- **Social**: dead filter chips removed; post actions labelled; relative times; text posts lead with the words.
- **Business mode**: Opportunities and Search scoped to the active business (and quoting as it); Jobs and Inbox rebuilt as work lists; Calendar no longer invents 9 am for untimed bookings and opens the booking itself; consistent headers; the customer's Live pill stays out of the Business workspace.
- **Auth**: sign-in leads; a compact "Continue as" control replaces three large role cards (role routing and the driver approval rule preserved); dark mode; reset asks for email only.
- **Global**: every icon-only button has an accessible name; no screen prints raw database/runtime errors (`userMessage()`); sentence case and ≥11px text; all three are enforced by source tests.

Per-route status: `route-progress-checklist.md` (15 redesigned · 9 refined · 3 fixed · 65 swept · 4 not screens).

## 1. Executive summary (pass 1)

This pass restructured the five highest-traffic surfaces around one principle — **show what the person needs to act on first** — and fixed a privacy bug found along the way.

- **Home**: compact location-first header, a search bar with a working Ask Everest action (replacing an inert filters icon), two clear intents, human-readable "Continue" card, consistent section headers, and Shop that never disappears. The redundant hamburger menu is gone; every item it held is still one tap away.
- **Activity**: the quote or payment waiting on you is now the first thing on screen, not below seven cards.
- **Business Today**: date header → setup notice → four counts → *Needs attention* → CRM. The 48px "0" hero, five tiles and marketing copy are gone.
- **Account, Shop, tab bar**: sentence-case, side-by-side profile identity, filter-row fix, no truncated labels at 320px.
- **Security / correctness**: the Live mini player could display another customer's live request to an admin account. Fixed client-side; no RLS change.

Pass 1 did not change Messages, Request, Product, Everest Live, Auth, CRM or ~40 secondary screens; phase 2 (above) covered most of those. See §10 for what remains.

## 2. Screens and components changed

| Area | Files |
|---|---|
| Home | `app/index.tsx` |
| Activity | `app/activity.tsx` |
| Business Today | `app/business-today.tsx` |
| Shop | `app/shop.tsx` |
| Profile | `app/account.tsx` |
| Overlays | `components/EverestLiveMiniPlayer.tsx`, `components/DraggableAskEverest.tsx` |
| Navigation | `components/CustomerTabBar.tsx` |
| Design system | `components/ui/SectionHeader.tsx` (new), `lib/format.ts` (new), `lib/floating-layers.ts` (new), `lib/theme.tsx` (`uiTokens.layout`), `lib/ui.ts` (removed) |

## 3. Navigation

Five customer tabs kept (3–5 destination guidance; a Shop tab was considered and rejected — see `navigation-architecture.md`). Home menu removed; Ask Everest 2 taps → 1; Shop reachable even with no products; duplicate "Local community" link removed from Activity; tab labels fit at 320px.

## 4. Interaction

Ask Everest button now avoids the Live mini player via a shared floating-layer registry. Mini player centred on wide screens. Pressed states use background tint instead of scale on list rows. No new animations.

## 5. Accessibility

- Removed all 8px text in touched files (mini player, cart badge); 12px is the floor for metadata.
- Section titles and screen titles carry `accessibilityRole="header"`; list rows announce label, status and detail; the verified badge is announced as "verified"; notification button announces the unread count.
- All new text links have 44px targets.
- Status uses `StatusBadge` (dot + text), never colour alone.
- CLASSIC (high-clarity) mode still drives larger type, targets and no motion on Home and Today.
- Not tested: VoiceOver/TalkBack, Dynamic Type at the largest sizes, keyboard-only web focus order.

## 6. Performance

No added requests (Home: 11 REST, 9 RPC before and after); bundle −4.2 KB; time-to-content unchanged within noise. Details in `performance-comparison.md`. Native performance not measured.

## 7. Bugs

13 fixed, 3 documented open — `bug-fix-register.md`. The P1 is BF-1 (mini player scope).

## 8. Tests executed

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | 0 errors, 12 warnings (all pre-existing, unchanged count) |
| `npm run audit` | Pass — 678 files, 96 routes |
| `npm run audit:migrations` | Pass — 235 migrations |
| `node --experimental-strip-types --test tests/*.test.mjs` | **421 / 421 pass** (414 before + 7 new in `tests/design-transformation.test.mjs`) |
| `npx expo-doctor` | 18 / 18 checks |
| `npm run build:web` | Pass, export verified |
| Visual capture (56 per build) | 0 overflow, 0 page errors |

**Phase 2 (latest run):** typecheck pass · lint 0 errors / 12 pre-existing warnings · **436 / 436 tests pass** (`tests/design-transformation.test.mjs` now has 23 tests, including source guards for accessible names, raw error display and legibility) · Chromium: discovery-foundation, search-discovery, visual-refinement (60 layouts) and typography (84 layouts) pass locally; CI on the PR head runs these in Chromium and WebKit plus webkit-chat and the native store gates. Phase-2 copy assertions changed to case-insensitive or to the new wording carry the same intent (for example, Jobs must still say booked work is separate from new requests).

Three existing assertions were **intentionally updated** because they pinned copy this pass changed; each now pins the new intent:
- `edge-home-quick-actions`: `--°` placeholder must be absent (was: present).
- `customer-experience-job-portal`: sentence-case "Continue where you left off" (was: uppercase).
- `professional-crm-v2`: Today's attention queue must precede Sales & CRM (was: uppercase labels `TODAY’S WORK`, `OPEN JOBS`).

Not run locally: native store CI (`validate-native-store-builds`), WebKit chat regression, discovery browser workflow. These run in GitHub Actions on the PR.

## 9. Before / after

See `visual-regression-report.md` and `evidence/before|after/`.

## 10. Unresolved issues and risks

- **Still only swept (layout unchanged)**: 65 routes, listed in `route-progress-checklist.md`. The largest: `public-user`, `story`/`create-*`/`sound` (social creation), `business-job` detail, `business-crm-booking`/`-quote`/`-deal`, `business-operations` (team), `services`/`products`/`product-editor`, `settings`/`notification-settings`, admin and delivery screens.
- **Business Jobs rows carry no service or customer name**: bookings expose no title column and I did not add reads of `service_requests` from Business mode without verifying the RLS policy. A server-side view or RPC returning a safe job title is the right fix (backend change, needs review).
- `userMessage()` is a deny-list: an unusual technical message that matches none of its patterns would still show. The existing allow-list `userFacingError` remains for enumerated flows.
- Copy changed on most screens; India variants and translations not reviewed.
- 12 pre-existing `exhaustive-deps` lint warnings unchanged.

## 11. Not verified

- **No real-backend journeys.** No authorised test environment or sandbox accounts were provided, so nothing was exercised against a real Supabase project or Stripe test mode. Every screenshot uses inert fixtures (reads return fixed rows, writes are refused). Quote acceptance, cancellation, booking, checkout and messaging were checked only for UI behaviour and source contracts, not end to end.
- **No native devices or simulators.** iOS/Android rendering, gestures, haptics, Android back, keyboard avoidance and notched safe areas are unverified. Native CI gates (iOS/Android store builds) pass in GitHub Actions; that is a build check, not a device test.
- WebKit was not available locally; WebKit browser suites run in CI only.
- Screen-reader output was checked by source (labels, roles, states), not with VoiceOver or TalkBack.

## 12. Review instructions

1. `npm ci && npm run typecheck && npm run lint && node --experimental-strip-types --test tests/*.test.mjs`
2. `npm run build:web && npx serve -s dist -l 4173`
3. `EVEREST_PREVIEW_URL=http://localhost:4173 node scripts/capture-design-evidence.mjs` (fixture clock pinned to 16 Oct 2026 19:00 Melbourne; writes to `/tmp/everest-design-evidence`). `EVEREST_QA_SCREENS`, `EVEREST_QA_VIEWPORTS`, `EVEREST_QA_THEMES` and `EVEREST_QA_FULL=1` narrow or extend the run.
4. Browser suites: `EVEREST_PREVIEW_URL=… EVEREST_QA_BROWSER=chromium node scripts/verify-{discovery-foundation,search-discovery,visual-refinement,typography-browser}.mjs` (set `EVEREST_BROWSER_PATH` if Chromium is not at `/usr/bin/chromium`).
5. On a device or the Vercel preview: (a) customer with two quotes: accept one and check the confirmation states that the other will be declined; (b) owner of two businesses: switch workspace and check Opportunities, Jobs and Inbox show only the active business; (c) admin while another account runs Everest Live: no mini player; (d) VoiceOver/TalkBack across Social and Business Jobs.

## 12a. Continuation instructions (for the next session)

Branch `design/everest-transformation-2026-10`, PR #104. Do not merge or deploy without the owner's approval.

1. Environment: `npm ci` (postinstall creates migration alias symlinks; they are excluded via `.git/info/exclude`, never commit them). Playwright lives at `/opt/node-tools/node_modules/playwright`; symlink it into `node_modules/` for the browser suites. Use `NODE_OPTIONS=--max-old-space-size=3072` for `tsc`/lint if the container is memory-constrained.
2. Before every push: `npm run -s lint` (0 errors), `npm run -s typecheck`, all tests, then rebuild and run the four discovery-browser suites in Chromium.
3. Historical phase-2 sequence (consult the updated checklist before acting; phase-3 work is already committed): `business-job` detail → `public-user` → social creation (`create`, `create-post`, `create-story`, `create-clip`, `story`) → `business-crm-booking`/`-quote`/`-deal` → `business-operations` (team) → `services`/`products`/`product-editor` → `settings` family → admin/delivery.
4. Patterns to reuse: `ScreenHeader`/`HeaderIconButton`, `ConfirmSheet` for anything consequential, `StatusBadge` + `formatStatus`, `formatMoney`/`formatSchedule`/`formatWhen`, `userMessage`, the Business header (name + "Business mode" + `ModeSwitcher`), 44pt targets, hairline list rows.
5. Add fixtures to `scripts/capture-design-evidence.mjs` before judging a screen; empty fixtures hide layout problems. Distinguish fixture artefacts from app bugs (see the register's note).
6. Update `route-progress-checklist.md`, `bug-fix-register.md` and this report with each pass.

## 13. Links

PR and preview links are recorded in the PR description.
