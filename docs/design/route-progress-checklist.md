# Route progress checklist

Generated from the branch diff against `a8490d7` (pre-transformation `main`). **Redesigned** = layout/IA rebuilt; **Refined** = targeted UX and copy changes on the existing layout; **Fixed** = behaviour/data fix; **Swept** = automated sentence-case and legibility pass only; **Not a screen** = redirect, alias or test harness. No route is untouched: every screen received the global passes below.

**Global passes applied to every screen (phase 2):** every icon-only button has an accessible name (enforced by a source test); caught errors go through `userMessage()` so database/runtime text never reaches people (enforced by a source test); sentence case and ≥11px text (enforced by a source test).

Verification column: fixture screenshots are browser renderings with inert Supabase fixtures (not authenticated real-backend tests, not native devices).

Totals: 15 redesigned · 9 refined · 3 fixed · 65 swept · 4 not screens (redirects/aliases/test harness) · 96 routes

| Route | Area | Status | Verification |
|---|---|---|---|
| `/account` | Account | Redesigned: identity header, Ask Everest in header | Fixture screenshots (web, 4 viewports, light/dark) |
| `/activity` | Account | Redesigned: attention-first, count strip, grouped rows | Fixture screenshots (web, 4 viewports, light/dark) |
| `/admin` | Admin / delivery | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/admin-operations` | Admin / delivery | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/appearance` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/archive` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/assistant` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/auth` | Auth / legal | Redesigned: sign-in leads, compact "Continue as" role control, dark mode, email-only reset, Terms/Privacy links | Fixture screenshots (web, 320/390/1280, light/dark) + reset and sign-up states |
| `/available-now` | Customer | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/booking` | Customer | Refined: sentence-case actions, formatted amounts (layout unchanged) | Typecheck + tests only |
| `/bookings` | Customer | Redesigned: shared header, tabs, status badges | Fixture screenshots (web, 4 viewports, light/dark) |
| `/business` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-automations` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-availability` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-bookings` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-calendar` | Business | Fixed: untimed bookings no longer drawn at 9 am; tapping opens the booking; exact money; legible rows; period-specific nav labels | Fixture screenshots (web, 320/390/1280, light/dark) |
| `/business-calendar-integrations` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-control` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-crm` | Business | Redesigned: actionable count strip + summary instead of 10 tiles | Fixture screenshots (web, 4 viewports, light/dark) |
| `/business-crm-booking` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-crm-quote` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-customer` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-customers` | Business | Refined: header aligned with Business mode screens (plus global passes) | Typecheck + tests only |
| `/business-dashboard` | Business | Not a screen: redirects to /business-today | Typecheck |
| `/business-deal` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-dm-automation` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-followers` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-growth` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-growth-p1` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-inbox` | Business | Redesigned: Messages-style rows, unread weight and badge, relative times, readable errors | Fixture screenshots (web, 320/390/1280, light/dark) with populated fixtures |
| `/business-integrations` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-invite` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-job` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-jobs` | Business | Redesigned: schedule-first rows, status badge, counts, verification CTA, readable errors with retry | Fixture screenshots (web, 320/390/1280, light/dark) with populated fixtures |
| `/business-leads` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-my-work` | Business | Refined: header, Ask Everest in header | Typecheck + tests only |
| `/business-onboarding` | Business | Not a screen: alias of /business | Covered by /business |
| `/business-operations` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-orders` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-payouts` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-profile` | Business | Redesigned: storefront header, single primary CTA, fixed broken Services link | Fixture screenshots (web, 4 viewports, light/dark) |
| `/business-profile-edit` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-today` | Business | Redesigned: attention-first, glance strip, Ask Everest in header | Fixture screenshots (web, 4 viewports, light/dark) |
| `/business-upgrade` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/business-verification` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/cart` | Customer | Refined: header, money format, copy | Fixture screenshots (web, 4 viewports, light/dark) |
| `/chat-input-regression` | Account | Not a product screen: regression-test harness route | Used by webkit-chat CI |
| `/connections` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/create` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/create-clip` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/create-post` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/create-story` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/customer-calendar` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/delete-account` | Auth / legal | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/delivery` | Admin / delivery | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/driver-dashboard` | Admin / delivery | Not a screen: alias of /delivery | Covered by /delivery |
| `/driver-onboarding` | Admin / delivery | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/driver-verification` | Admin / delivery | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/edit-profile` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/everest-live` | Customer | Redesigned: header, de-duplicated counts, confirm book/cancel, reconnect state; web map fixed | Fixture screenshots (web, 4 viewports, light/dark) |
| `/external-businesses` | Customer | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/external-quotes` | Customer | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/help` | Auth / legal | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/highlight` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/highlights` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/` | Customer | Redesigned: compact header, Ask in search, intents, formatted context, persistent Shop | Fixture screenshots (web, 4 viewports, light/dark) |
| `/instant-book` | Customer | Refined: copy and legible type | Typecheck + tests only |
| `/memberships` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/messages` | Customer | Redesigned: list chrome, rows, dates, legible controls; Live bar hidden in threads | Fixture screenshots (web, 4 viewports, light/dark) |
| `/notification-settings` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/notifications` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/opportunities` | Business | Fixed: scoped to active business, quotes as that business | Typecheck + tests only |
| `/orders` | Customer | Redesigned: shared header, grouped rows, status badges | Fixture screenshots (web, 4 viewports, light/dark) |
| `/privacy` | Auth / legal | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/product` | Customer | Refined: stock honesty (sold out text, low-stock tone), prices, CTA copy | Fixture screenshots (web, 4 viewports, light/dark) |
| `/product-editor` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/products` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/promote-post` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/public-user` | Social | Swept: global passes only (accessible names, safe error copy); layout unchanged | Typecheck + tests only |
| `/quotes` | Customer | Redesigned: comparable facts, honest badges, confirm-before-accept | Fixture screenshots (web, 4 viewports, light/dark) |
| `/request` | Customer | Refined: copy only (step flow already structured) | Fixture screenshots (web, 4 viewports, light/dark) |
| `/requests` | Customer | Redesigned: shared header, status badges, formatted dates | Fixture screenshots (web, 4 viewports, light/dark) |
| `/reviews` | Customer | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/saved` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/saved-searches` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/search` | Customer | Fixed: business job results scoped to active business | Fixture screenshots (web, 4 viewports, light/dark) |
| `/service-areas` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/services` | Business | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/settings` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/share-result` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/shop` | Customer | Refined: filters, prices, header | Fixture screenshots (web, 4 viewports, light/dark) |
| `/social` | Social | Refined: removed dead chips; labelled post actions; relative times; text posts lead with the caption | Fixture screenshots (web, 320/390/1280, light/dark) with feed fixtures |
| `/social-privacy` | Account | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/sound` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/story` | Social | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
| `/terms` | Auth / legal | Swept: sentence case, legible type, formatted enums (structure unchanged) | Typecheck + tests only |
