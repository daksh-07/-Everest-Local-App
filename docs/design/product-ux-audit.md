# Product UX audit — October 2026

Baseline: `main` at `a8490d7` (PR #103 merged). Screens were captured from a production-style web export (`npm run build:web`) using `scripts/capture-design-evidence.mjs`, which mocks every Supabase call with inert fixtures (reads return fixed rows, writes are refused). Captures: 7 screens × 2 themes × 4 viewports (320×568, 390×844, 412×915, 1280×800).

The route-by-route inventory of all 96 Expo routes, grouped by surface, is in `docs/experience-v2-screen-inventory.md` and was not re-derived. The table below adds this pass's findings.

## Screen inventory by audience (summary)

| Audience | Primary routes | Audited this pass |
|---|---|---|
| Guest | `/`, `/search`, `/shop`, `/product`, `/business-profile`, `/auth` | Home (guest), Search, Shop |
| Customer | `/activity`, `/requests`, `/quotes`, `/bookings`, `/orders`, `/cart`, `/messages`, `/account`, `/request`, `/everest-live` | Home, Activity, Account, Live mini player |
| Business owner | `/business-today`, `/business-jobs`, `/business-calendar`, `/business-inbox`, `/business-crm`, `/business-control`, `/business-payouts` | Business Today |
| Employee | `/business-my-work`, `/business-job` | Source only |
| Shared | `_layout.tsx` overlays (Ask Everest, Live mini player, opportunity alert, PWA prompt), tab bars | All overlays |
| Auth / account | `/auth`, `/settings`, `/edit-profile`, `/delete-account` | Source only |
| India variants | Separate in-progress work (not on `main`) | Not touched |

Authenticated flows (bookings, payments, messaging, dispatch) were **not** exercised against a real backend: no sandbox credentials were available. Fixtures prove layout, not transactions.

## Issue matrix

| ID | Sev | Screens | Finding (evidence) | Correction | Verification | Status |
|---|---|---|---|---|---|---|
| A1 | P1 | All signed-in | Live mini player queried `service_requests` with no `customer_id` filter. RLS is `customer_id = auth.uid() OR is_admin()`, so admin accounts would see another customer's live request as their own; its realtime channel also listened to every request/quote change | Filter query and realtime channel by session `customer_id` | `tests/design-transformation.test.mjs` | Fixed |
| A2 | P2 | Activity, Account, Shop, Business Today | Ask Everest button overlapped the Live mini player, hiding its distance badge (before: `activity-dark-390x844.png`) | Floating-layer registry; button clamps above registered layers | Screenshot + test | Fixed |
| A3 | P2 | Desktop web | Mini player anchored left instead of centred over the tab bar | Explicit centred inset | `home-light-1280x800.png` | Fixed |
| A4 | P2 | Live mini player | 8px text ("3 KM", "Tap to open") | 13–14px; redundant hint removed | Test forbids `fontSize:8` | Fixed |
| A5 | P2 | Home | Hamburger menu duplicated tab destinations; the only Home entry to Ask Everest (the button is hidden on Home) | Menu removed; Ask added to search bar | Test asserts every route stays reachable | Fixed |
| A6 | P2 | Home | Search showed a filters icon that did nothing | Replaced by working Ask action | Screenshot | Fixed |
| A7 | P2 | Home | Weather showed `--°` when unavailable | Weather omitted until real | Updated test | Fixed |
| A8 | P2 | Home, Activity | Raw ISO dates (`2026-10-20 · 10:00`, `Scheduled 2026-10-20 at 10:00:00`) and `$240.00 AUD` | `lib/format.ts` (`Tue, 20 Oct · 10:00 am`, `$240.00`) | Unit tests | Fixed |
| A9 | P2 | Home | Shop section disappeared entirely when no products loaded | Persistent "Browse products" entry | Test | Fixed |
| A10 | P2 | Home 320px | Intent tiles truncated ("Request qu…", "Need it…") | Stack below 360px | `home-guest-*-320x568.png` | Fixed |
| A11 | P2 | Tab bar 320px | "Messages" truncated | Tighter insets below 360px | Screenshot | Fixed |
| A12 | P3 | Home (guest) | Avatar showed "EL" — initials of the app name | Person icon for guests | Screenshot | Fixed |
| A13 | P2 | Activity | The decision items were below a marketing hero, four shortcut cards and three utility cards (below the fold at 390×844) | Count strip, then *Needs your attention* | Screenshot + order test | Fixed |
| A14 | P3 | Activity | "Local community" link duplicated the Explore tab | Removed | Test | Fixed |
| A15 | P2 | Business Today | Opened with marketing copy, a 48px "0" hero and five stat tiles before the work queue | Date header → setup notice → 4-count strip → *Needs attention* → CRM | Screenshot + order test | Fixed |
| A16 | P3 | Business Today | Uppercase actions (`OPEN JOB`, `OPEN INBOX`) and section labels | Sentence case; "Reply" for messages | Test | Fixed |
| A17 | P3 | Shop | "All" category chip sat alone on its own row when no categories exist; fulfilment chips wrapped | Hide empty category row; horizontal filter scroll | Screenshot | Fixed |
| A18 | P3 | Shop | 8px cart badge text | 11px | Source | Fixed |
| A19 | P3 | Account | Uppercase eyebrows ("EVEREST LOCAL", "SHARED WITH YOUR COMMUNITY"), raw enum statuses, 94px placeholder avatar with a stray expand glyph | Side-by-side identity header, sentence case | Screenshot | Fixed |
| A20 | P3 | Home | Legacy `lib/ui.ts` palette (green brand `#195b43`) still imported for layout width | Removed; `uiTokens.layout` | `tsc` | Fixed |
| B1 | P2 | Business Today | Ask Everest button can cover the "Open CRM" link (draggable, so recoverable) | Not changed — needs a decision on whether Ask belongs in Business Mode | — | Open |
| B2 | P2 | Messages, Request, Product, Everest Live, Auth | Not redesigned this pass; prior passes refined chat (see `iphone-chat-*` tests) | — | — | Open |
| B3 | P3 | Many | `fontWeight:'900'` and uppercase micro-labels remain on ~40 secondary screens | Migrate to `SectionHeader` and sentence case | — | Open |
| B4 | P1 | Guest search | Prior audit: anonymous search RPC denies execution (PR 97 migration work) | Backend — not changed here | — | Open (pre-existing) |
