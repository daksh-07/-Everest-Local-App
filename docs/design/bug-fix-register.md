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

## Phase 2 (PR #104 continuation)

Severity: P1 = wrong data or a consequential action without confirmation; P2 = broken or misleading UI; P3 = polish. Evidence paths are under `docs/design/evidence/phase2/`.

| ID | Sev | Bug | Reproduction | Fix | Test / evidence |
|---|---|---|---|---|---|
| BF-20 | P1 | Opportunities listed every business's leads to admins and multi-business members, and quoted as the oldest authorised business | Member of two businesses; switch workspace; open Opportunities | Scoped to `active_business_id`; `send_quote_for_business` with the active business | `design-transformation`: "business opportunity screens act only for the active workspace business" |
| BF-21 | P1 | Quotes and Everest Live accepted a quote in one tap (other quotes declined silently) | Tap "Choose & book" | `ConfirmSheet` states price, deposit, timing and that other quotes will be declined | Test "Everest Live: consequential actions confirm first…" |
| BF-22 | P1 | Cancelling a live request was one tap | Tap "Cancel search" | Destructive `ConfirmSheet` | same |
| BF-23 | P2 | "Recommended"/"Best match" badges shown without evidence | Any quote list | Badge only when the score lead or strictly lowest price is real | `after/quotes-light-390x844.png` |
| BF-24 | P2 | Web Live map never placed markers (onLayout never fired after data arrived) | Open Live on web | Keyed remount of the map branch | Test "web Live map remounts…" |
| BF-25 | P2 | Map used CARTO tiles without attribution configuration; radius rings were decorative | Open Live | Tiles only via `EXPO_PUBLIC_LIVE_MAP_TILE_URL` + attribution; schematic grid otherwise; radius computed from metres per pixel | `components/LiveSearchMap.web.tsx` |
| BF-26 | P2 | While reconnecting, Live replaced the confirmed server status with "searching" | Drop the realtime socket | Server status kept; separate "Reconnecting" note | Unit test on `livePresentation` |
| BF-27 | P2 | Live mini player covered the chat composer and floated mid-screen on non-tab routes | Open a thread with a live request | Hidden in open threads and flows; anchored per tab-bar route | Tests "messages…", "mini player anchors…" |
| BF-28 | P2 | Customer's Live pill floated over Business-mode screens | Live request active, switch to Business mode | Hidden on `/business*` except the public `/business-profile` | Test "business jobs and inbox…" |
| BF-29 | P2 | Storefront "Request a quote" linked to `tab=SERVICES`, which Search does not have | Business profile CTA | Opens the request for that business's service | Test "business profile is a storefront…" |
| BF-30 | P2 | Social filter chips did nothing | Tap "For you"/locality chips | Removed; honest locality note | `after/social-light-390x844.png` |
| BF-31 | P2 | Calendar drew Everest bookings without a time at 9:00 am | Booking with `scheduled_time` null | "Time to confirm", sorted first for the day | Test "calendar never invents a booking time…", `after/business-calendar-light-390x844.png` |
| BF-32 | P2 | Calendar booking tap opened the Jobs list, not the booking; prices rounded to whole dollars | Tap an Everest booking | Opens `/business-job?id=`; `formatMoney` | same |
| BF-33 | P2 | Password reset showed a password field | Sign in → Forgot password | Email only | Test "sign-in leads with authentication…", `after/auth-reset-light-390x844.png` |
| BF-34 | P2 | Sign-in form below the fold behind three large role cards; no dark mode | Open /auth | Compact role control; themed | `after/auth-*.png` |
| BF-35 | P2 | 177 catch sites on 66 screens displayed raw `e.message` (Postgres/PostgREST text) | Any RLS or network failure | `userMessage()` | Unit test + source guard |
| BF-36 | P2 | 92 icon-only buttons had no accessible name | VoiceOver/TalkBack on back, close, delete, like, play… | Action labels with state | Source guard test |
| BF-37 | P2 | Jobs rows repeated a fixed "Checklist · arrival updates · completion record" line | Any job | Removed; schedule, status, price | `after/business-jobs-light-390x844.png` |
| BF-38 | P3 | Post dates printed as numeric locale dates; text-only posts put actions before words | Social feed | Relative times; caption leads | Test "social posts…" |
| BF-39 | P3 | `crmLabel` title-cased ("In Progress") | CRM, calendar | Shared sentence-case formatter | Unit tests on `formatStatus` |
| BF-40 | P3 | 8–10px text and raw enums in 13 tab/chip groups | Many screens | Sweep + source guard | Test "app copy stays sentence case and legible" |

Fixture artefacts that looked like bugs and were not (the app was correct): product crash and Live "unavailable" (fixture shape), "Yesterday" on today's jobs (fixture clock in UTC vs Melbourne browser), zero tab counts (fixture did not expose `content-range`), Live "Responses 0" with two quotes (fixture `quote_count`). The capture script now pins the clock, filters like PostgREST and exposes counts.

## Not fixed (documented)

| ID | Sev | Issue | Why not | Next step |
|---|---|---|---|---|
| NF-1 | P1 | Anonymous search RPC denies execution (from prior audit) | Requires a migration and security review (PR 97) | Coordinate with backend owner |
| NF-2 | — | ~~Ask Everest button can cover Business Today links~~ | Resolved in phase 2: the floating button was removed; Ask Everest is a header action on Home, Account, Business Today and My work | — |
| NF-3 | — | 12 pre-existing ESLint `exhaustive-deps` warnings | Behavioural risk outside this scope | Review individually |

No database, RLS, payment, Stripe or edge-function code was changed in either phase. Client queries were only narrowed (scoped to the signed-in customer or active business), never widened.

## Phase 4 — shopping continuation

| ID | Sev | Issue | Resolution | Verification |
|---|---|---|---|---|
| BF-41 | P2 | Persisted `EVEREST_DELIVERY` and `SAME_DAY` orders had no fulfilment label | Explicit method labels with an honest unknown fallback | Order presentation tests |
| BF-42 | P2 | Pending/action-required payments had no next-step guidance; pickup readiness could be misread for a delivery order | Status-specific guidance separates payment, collection and dispatch | Presentation tests and fixture browser scenarios |
| BF-43 | P2 | Shared warning badges used the primary blue action colour | Semantic warning foreground/container; long labels wrap | Palette tests and narrow-screen captures |
| BF-44 | P3 | One-character addresses enabled checkout but were rejected by the existing commerce validation | Match the existing five-character minimum in the UI | Fixture browser checks for short and complete addresses |

No server, RLS, payment or dispatch contract changed. Corrected commerce fixtures from `PAID`/`DELIVERY` to persisted `SUCCEEDED`/`EVEREST_DELIVERY`; mixed-business cart remains a separate rejection scenario.

| ID | Sev | Issue | Resolution | Verification |
|---|---|---|---|---|
| BF-45 | P2 | Product selection could default to a fully reserved variant | Select only available options with sellable stock (respect made-to-order/untracked stock) | Product presentation unit tests |
| BF-46 | P2 | Product quantity could exceed 99; addition silently truncated while reporting the original quantity | Cap selection and refuse over-limit combined quantities with a cart-review message | Boundary tests at 98+1 and 98+2 |
| BF-47 | P2 | Live mini-player could cover the final Orders help row | Reserve scroll space below the final control | Orders fixture captures |
