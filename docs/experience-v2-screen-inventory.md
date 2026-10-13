# Screen inventory and prioritization

All 96 Expo routes were enumerated and source/configuration audited by the repository static audit. This inventory describes code evidence and coverage, not a claim that every authenticated journey was executed. Browser baseline screens and shared pager transitions were captured. Protected business, payment, staff and account flows require controlled accounts/backend fixtures for real task verification; visiting their sign-in redirects would not constitute screen QA.

## Impact order

| Priority | Finding | Action / evidence |
| --- | --- | --- |
| P0 | Guest Search calls a function that currently denies anonymous execution; raw permission errors leave discovery blocked | B provides honest account guidance and preserves query on account entry. Guest search enablement remains PR 97 migration work |
| P0 | Existing permission override can precede active-membership validation in trusted helper | Documented; no frontend shortcut or policy change. Coordinate PR 97 security review |
| P0 | India draft phase 2 needs dispatch isolation migration/functions and payment/KYC readiness | Keep draft and payment rails disabled; no AU rewrite |
| P1 | Hidden Explore hydrates feed/engagement/media at Home startup | A verified 20 → 6 REST requests across three runs |
| P1 | Search can display an old response during the next query debounce window | B immediately invalidates old generation and aborts transport; delayed-response browser regression |
| P1 | Retained Messages polling may continue behind non-pager routes | A visibility gate; shipped message identity/composer behavior preserved |
| P1 | Service categories sit below community content; first-time Search only shows empty history | B shows eight services before community and useful Search entry paths |
| P1 | Navigation pan begins before horizontal recognition; settled swipe destinations may lack adjacent mounts | A defers pan start and mounts destination window; browser gesture checks |
| P2 | Search lacks direct back action; tabs lack explicit selected semantics | B back/clear controls, semantic tabs and larger touch targets |
| P2 | 320 px action wrapping, truncation and assistant overlay obscure content | Visual loop refined compact actions, Activity label and menu-based assistant access |
| P2 | Global business fallback is labeled nearby without proof | B labels discovery truthfully; geographic filtering remains coordinated PR 97 work |
| P2 | Community media warning appears ahead of primary service tasks | B places it beside affected community content |
| P3 | Native motion, haptics and text rendering need hardware profiling | Deferred until real simulator/device/EAS access; no spring-only performance claims |

## Route inventory

Signals below are direct source occurrences and do not guarantee those states work. A screen without a shared state component may use its own state implementation. Individual priorities are assigned above only where evidence supports them; untested screens are not given speculative defect grades.

| Route | Surface | Source lines | Observed implementation signals | Verification |
| --- | --- | ---: | --- | --- |
| `/account` | Account/shared | 312 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/activity` | Account/shared | 47 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/admin-operations` | Account/shared | 39 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/admin` | Account/shared | 216 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/appearance` | Account/shared | 40 | safe area | Source inventory only; authenticated/native behavior unverified |
| `/archive` | Social/messaging | 28 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/assistant` | Account/shared | 700 | spinner, keyboard avoidance, safe area | Source inventory only; authenticated/native behavior unverified |
| `/auth` | Onboarding/auth | 857 | spinner, keyboard avoidance, safe area | Browser baseline captured |
| `/available-now` | Commerce/booking | 38 | refresh, spinner, safe area | Browser baseline captured |
| `/booking` | Commerce/booking | 84 | refresh, shared empty, shared error, safe area | Source inventory only; authenticated/native behavior unverified |
| `/bookings` | Commerce/booking | 34 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-automations` | Business/operations | 24 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-availability` | Business/operations | 31 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-bookings` | Business/operations | 23 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-calendar-integrations` | Business/operations | 19 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-calendar` | Business/operations | 66 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-control` | Business/operations | 106 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-crm-booking` | Business/operations | 63 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-crm-quote` | Business/operations | 65 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-crm` | Business/operations | 131 | refresh, spinner, keyboard avoidance, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-customer` | Business/operations | 88 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-customers` | Business/operations | 97 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-dashboard` | Business/operations | 3 | Screen-specific states | Source inventory only; authenticated/native behavior unverified |
| `/business-deal` | Business/operations | 62 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-dm-automation` | Business/operations | 68 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-followers` | Business/operations | 52 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-growth-p1` | Business/operations | 14 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-growth` | Business/operations | 84 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-inbox` | Business/operations | 39 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-integrations` | Business/operations | 212 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-invite` | Business/operations | 87 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-job` | Business/operations | 35 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-jobs` | Business/operations | 121 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-leads` | Business/operations | 47 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-my-work` | Business/operations | 101 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-onboarding` | Business/operations | 1 | Screen-specific states | Source inventory only; authenticated/native behavior unverified |
| `/business-operations` | Business/operations | 80 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-orders` | Business/operations | 21 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-payouts` | Business/operations | 161 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-profile-edit` | Business/operations | 31 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-profile` | Business/operations | 132 | refresh, spinner, safe area | Browser baseline captured |
| `/business-today` | Business/operations | 78 | refresh, skeleton, shared error, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-upgrade` | Business/operations | 130 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business-verification` | Business/operations | 216 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/business` | Business/operations | 64 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/cart` | Commerce/booking | 30 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/chat-input-regression` | Account/shared | 14 | safe area | Source inventory only; authenticated/native behavior unverified |
| `/connections` | Social/messaging | 31 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/create-clip` | Social/messaging | 94 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/create-post` | Social/messaging | 188 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/create-story` | Social/messaging | 41 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/create` | Social/messaging | 56 | safe area | Source inventory only; authenticated/native behavior unverified |
| `/customer-calendar` | Account/shared | 58 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/delete-account` | Account/shared | 3 | safe area | Source inventory only; authenticated/native behavior unverified |
| `/delivery` | Account/shared | 43 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/driver-dashboard` | Account/shared | 1 | Screen-specific states | Source inventory only; authenticated/native behavior unverified |
| `/driver-onboarding` | Onboarding/auth | 333 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/driver-verification` | Onboarding/auth | 64 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/edit-profile` | Account/shared | 19 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/everest-live` | Commerce/booking | 158 | refresh, spinner, shared empty, shared error, safe area | Source inventory only; authenticated/native behavior unverified |
| `/external-businesses` | Account/shared | 79 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/external-quotes` | Commerce/booking | 26 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/help` | Account/shared | 11 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/highlight` | Account/shared | 66 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/highlights` | Social/messaging | 33 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/` | Customer Home | 291 | refresh, skeleton, shared error, safe area | Release A/B rendered interactions checked |
| `/instant-book` | Account/shared | 17 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/memberships` | Onboarding/auth | 63 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/messages` | Social/messaging | 732 | spinner, skeleton, shared empty, keyboard avoidance, safe area | Shipped chat foundation; CI WebKit composer checked |
| `/notification-settings` | Account/shared | 10 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/notifications` | Account/shared | 24 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/opportunities` | Business/operations | 20 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/orders` | Commerce/booking | 17 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/privacy` | Account/shared | 14 | safe area | Source inventory only; authenticated/native behavior unverified |
| `/product-editor` | Account/shared | 56 | spinner, keyboard avoidance, safe area | Source inventory only; authenticated/native behavior unverified |
| `/product` | Commerce/booking | 89 | spinner, safe area | Browser baseline captured |
| `/products` | Business/operations | 26 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/promote-post` | Account/shared | 84 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/public-user` | Social/messaging | 663 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/quotes` | Commerce/booking | 56 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/request` | Commerce/booking | 1629 | spinner, keyboard avoidance, safe area | Source inventory only; authenticated/native behavior unverified |
| `/requests` | Commerce/booking | 15 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/reviews` | Commerce/booking | 45 | shared empty, shared error, keyboard avoidance, safe area | Source inventory only; authenticated/native behavior unverified |
| `/saved-searches` | Account/shared | 18 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/saved` | Social/messaging | 61 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/search` | Account/shared | 642 | spinner, shared error, safe area | Release A/B rendered interactions checked |
| `/service-areas` | Business/operations | 8 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/services` | Business/operations | 18 | refresh, spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/settings` | Account/shared | 17 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/share-result` | Account/shared | 21 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/shop` | Commerce/booking | 35 | spinner, safe area | Browser baseline captured |
| `/social-privacy` | Account/shared | 16 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/social` | Social/messaging | 402 | refresh, spinner, virtual list, safe area | Release A/B rendered interactions checked |
| `/sound` | Social/messaging | 55 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/story` | Social/messaging | 73 | spinner, safe area | Source inventory only; authenticated/native behavior unverified |
| `/terms` | Account/shared | 15 | safe area | Source inventory only; authenticated/native behavior unverified |
