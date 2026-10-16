# Bug-fix register

| ID | Sev | Bug | Reproduction | Fix | Test / evidence | Commit |
|---|---|---|---|---|---|---|
| BF-1 | P1 | Live mini player could show another customer's live request | Sign in as an admin while any customer has a live request. The player's query had no `customer_id` filter and RLS (`customer_id = auth.uid() OR is_admin()`) returned the other customer's row | Filter query and realtime channel by session user; session read is local (no extra request) | `tests/design-transformation.test.mjs` › "Live mini player only shows…" | `fix(live): scope mini player…` |
| BF-2 | P2 | Ask Everest button covered the Live mini player | Any screen except Home/Search/etc. with an active live request (before: Activity, Shop, Account, Business Today) | Floating-layer registry; button clamps above it | Screenshots; test "floating layers coordinate" | same |
| BF-3 | P2 | 8px text in mini player | Visible on any active live request | 13–14px, hint removed | Test forbids `fontSize:8` | same |
| BF-4 | P2 | Mini player left-aligned on wide screens | Viewport ≥ 645px | Centred inset from window width | `after/home-light-1280x800.png` | `fix(live): centre…` |
| BF-5 | P2 | Home search showed an inert filters icon | Tap the icon: it only opened Search like the rest of the bar | Replaced by Ask Everest action | Screenshot | `feat(home)…` |
| BF-6 | P2 | `--°` weather placeholder shown as data | Location known, weather failed | Omit weather until real | `tests/edge-home-quick-actions.test.mjs` (updated) | `feat(home)…` |
| BF-7 | P2 | Shop disappeared from Home when no products loaded | Empty or failed `searchShop` | Persistent entry row | Test | `feat(home)…` |
| BF-8 | P2 | Intent buttons truncated at 320px | 320×568 viewport | Stack below 360px | `after/home-guest-dark-320x568.png` | `feat(home)…` |
| BF-9 | P2 | "Messages" tab label truncated at 320px | 320×568 viewport | Narrow insets below 360px | Screenshot | `fix(nav)…` |
| BF-10 | P3 | Guest avatar showed "EL" | Signed out | Person icon | Screenshot | `feat(home)…` |
| BF-11 | P3 | Raw ISO dates and `$X AUD` strings | Any booking/quote | `lib/format.ts` | Unit tests | `feat(home)…`, `feat(activity)…` |
| BF-12 | P3 | Raw enum statuses (`PUBLISHED`, `BEFORE_AFTER`) on profile posts | Profile with posts | `formatStatus` | Source | `feat(profile)…` |
| BF-13 | P3 | 8px cart badge in Shop | Items in cart | 11px | Source | `fix(shop)…` |

## Not fixed (documented)

| ID | Sev | Issue | Why not | Next step |
|---|---|---|---|---|
| NF-1 | P1 | Anonymous search RPC denies execution (from prior audit) | Requires a migration and security review (PR 97) | Coordinate with backend owner |
| NF-2 | P2 | Ask Everest button can cover Business Today links | Product decision on Ask in Business Mode | Decide; then hide on business routes or dock it |
| NF-3 | — | 12 pre-existing ESLint `exhaustive-deps` warnings | Behavioural risk outside this scope | Review individually |

No database, RLS, payment, Stripe or edge-function code was changed.
