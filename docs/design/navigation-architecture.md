# Navigation architecture

## Current structure (kept)

**Customer** — five tabs over a swipeable pager (`lib/customer-pager.tsx`, `lib/customer-page-model.ts`):

| Tab | Route | Job |
|---|---|---|
| Home | `/` | Start something: search, request quotes, Everest Live, browse services, businesses, shop |
| Explore | `/social` (posts and clips pages) | Local community content |
| Activity | `/activity` | Everything already started: requests, quotes, bookings, orders |
| Messages | `/messages` | Conversations |
| Account | `/account` | Profile, posts, settings menu |

**Business** — `BusinessTabBar` with Today as home; CRM is a workspace reached from Today, not a tab.

Stack routes (Search, Shop, Product, Request, Business profile, etc.) push over tabs with platform-default transitions; `/create` is a transparent modal. Route guards live in `app/_layout.tsx` and were not changed.

## Alternatives considered

| Option | For | Against | Decision |
|---|---|---|---|
| Add a Shop tab (6 tabs) | Makes commerce first-class | Exceeds the 3–5 destination guidance (research rows 7–8); pushes labels below legible width at 320px | Rejected |
| Replace Explore with Shop | Commerce over community | Removes the only top-level home for posts/clips; social is an existing differentiator | Rejected for now |
| Keep tabs, make Shop always reachable from Home | No IA churn; Shop entry persists even with no products | Shop is one tap deeper than a tab | **Chosen** |
| Keep Home hamburger menu | One place for everything | It listed destinations already in tabs; tab bars should not need a second navigation layer | **Removed** |

## Changes in this pass

1. Removed the Home menu sheet. Each of its eight items remains reachable: Search, Request, Live and Shop from Home; Ask Everest from the search bar; Local feed via Explore; Bookings and Orders via Activity (and Home's "Continue" card). Covered by `tests/design-transformation.test.mjs`.
2. Activity no longer links to "Local community" (that is the Explore tab).
3. Tab labels no longer truncate at 320px.

## Journey tap counts (customer, from Home)

| Journey | Before | After |
|---|---|---|
| Ask Everest | 2 (menu → item) | 1 (Ask in search bar) |
| Shop when no products loaded on Home | 2 (menu → Shop local) | 1 (Browse products row) |
| Open the quote waiting for a decision (Activity) | Tab + scroll past 7 cards | Tab, first row |
| Business: reply to an unread message (Today) | Scroll past hero and tiles | First section after counts |

## Not changed / to verify on device

- Android hardware back and iOS edge-swipe with the pager: no native device was available. Existing `tests/customer-pager-regression.test.mjs` passes.
- Deep links and auth redirects: unchanged code; not re-tested end-to-end.
