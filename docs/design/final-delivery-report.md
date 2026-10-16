# Final delivery report — design transformation, pass 1

Branch `design/everest-transformation-2026-10`, based on `main` @ `a8490d7`. Not deployed to production.

## 1. Executive summary

This pass restructured the five highest-traffic surfaces around one principle — **show what the person needs to act on first** — and fixed a privacy bug found along the way.

- **Home**: compact location-first header, a search bar with a working Ask Everest action (replacing an inert filters icon), two clear intents, human-readable "Continue" card, consistent section headers, and Shop that never disappears. The redundant hamburger menu is gone; every item it held is still one tap away.
- **Activity**: the quote or payment waiting on you is now the first thing on screen, not below seven cards.
- **Business Today**: date header → setup notice → four counts → *Needs attention* → CRM. The 48px "0" hero, five tiles and marketing copy are gone.
- **Account, Shop, tab bar**: sentence-case, side-by-side profile identity, filter-row fix, no truncated labels at 320px.
- **Security / correctness**: the Live mini player could display another customer's live request to an admin account. Fixed client-side; no RLS change.

What this pass is **not**: a redesign of every screen. Messages, Request, Product, Everest Live (full screen), Auth, CRM and ~40 secondary screens were not changed. See §10.

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

Three existing assertions were **intentionally updated** because they pinned copy this pass changed; each now pins the new intent:
- `edge-home-quick-actions`: `--°` placeholder must be absent (was: present).
- `customer-experience-job-portal`: sentence-case "Continue where you left off" (was: uppercase).
- `professional-crm-v2`: Today's attention queue must precede Sales & CRM (was: uppercase labels `TODAY’S WORK`, `OPEN JOBS`).

Not run locally: native store CI (`validate-native-store-builds`), WebKit chat regression, discovery browser workflow. These run in GitHub Actions on the PR.

## 9. Before / after

See `visual-regression-report.md` and `evidence/before|after/`.

## 10. Unresolved issues and risks

- **Not redesigned**: Messages, Request flow, Product detail, full-screen Everest Live, Cart/Checkout, Auth/onboarding, Explore feed/stories/clips, Business Jobs/Calendar/Inbox/CRM/Employees, Settings. These are the next passes, in roughly that priority.
- Ask Everest overlapping Business Today links (NF-2) needs a product decision.
- Copy changed on Home, Activity and Today; translation/India variants not reviewed.
- Removing the Home menu changes muscle memory for existing users; every destination remains reachable (tested).

## 11. Not verified

- Any authenticated journey against a real backend (bookings, quotes, payments, Live dispatch, messaging). No sandbox accounts or Stripe test credentials were available; all screenshots use fixtures.
- iOS and Android rendering, gestures, haptics, Android back, safe areas on notched hardware — no simulator or device.
- Light/dark on native status bars.

## 12. Review instructions

1. `npm ci && npm run typecheck && npm run lint && node --experimental-strip-types --test tests/*.test.mjs`
2. `npm run build:web && npx serve -s dist -l 4173`
3. `EVEREST_PREVIEW_URL=http://localhost:4173 node scripts/capture-design-evidence.mjs` (writes to `/tmp/everest-design-evidence`)
4. On a device or the Vercel preview: sign in as (a) a customer with an open quote, (b) a business owner, (c) an admin with another account running Everest Live — confirm the admin sees **no** mini player.
5. Commits are split by surface; each one builds and passes tests on its own.

## 13. Links

PR and preview links are recorded in the PR description.
