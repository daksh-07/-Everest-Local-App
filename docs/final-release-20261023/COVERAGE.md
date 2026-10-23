# Coverage versus acceptance

Static security/navigation audit covers every current Expo route. Unit/source assertions, focused SQL and intercepted browser sessions do not establish an end-to-end production journey. A route's presence or successful export is not a functional pass.

| Requested area | Available verification | Outstanding mandatory acceptance |
| --- | --- | --- |
| Home, discovery, search, categories, location | Exported discovery/search fixtures; new manual location validation; section failures/retry, widths/themes/focus/axe | Genuine public staging discovery, denied/allowed device GPS, actual market isolation |
| Requests, Live, offers, quote acceptance, bookings | Matching/lifecycle/permissions/acceptance SQL; lost-response/competing-decision client tests; Live/Quotes browser groups | Real issued customer/provider sessions; full-trigger concurrency, expiry, cancellation, duplicate prevention, rollback and offline recovery |
| Messaging and notifications | Existing messaging/security/unit suites; exported WebKit input regression; new read-receipt/counterpart code typechecks | Two real accounts, realtime delivery/read receipts, push/background/deep-link behavior on devices |
| Profile, Settings, recovery, guest/error/loading/navigation | Static/unit/auth guards; public-profile and discovery fixtures; guest cart/workspace protection | Real signup/password reset/session expiry, account switching, private-profile access and persisted settings on devices |
| Business onboarding/verification/switching | Existing ABR/security/RBAC tests; verified canonical migration reconciliation; new deep-link handling | Staging registry/error cases, real provider onboarding and business switching/removed-staff sessions |
| Availability, opportunities, quoting, jobs, staff, calendar, CRM | Exported operational matrix and role restrictions; matching and permission contracts; per-section recovery tests | Full-schema real owner/staff/removed-staff RLS, assignment/realtime and physical calendar/location permission acceptance |
| Products, variations, stock, cart, checkout preparation, orders, pickup/delivery/cancellation | Existing unit/security contracts; new guest inventory RLS fixture; current product/cart source retained | Full genuine marketplace journey is BLOCKED; #105's transaction rollout and inventory reconciliation remain isolated and unmerged |
| Posts, comments, threads, reporting, privacy, moderation | Comment browser/SQL cases; two-way block/public guest/identity SQL; confirmed post/report mutations; admin failure/cap fixtures | Real independent Auth sessions, storage access, cross-account RLS/realtime moderation and full privilege review |
| Admin | Five exported failure/empty/capped-count cases per engine; MFA/source/security tests; catalog review | Real password+TOTP admin, controlled driver review and actual privileged data isolation |
| Themes, reduced motion, responsive/accessibility | Eight viewport widths; LIGHT/DARK true-black; focus/overflow/axe and visual fixtures | Physical devices, VoiceOver/TalkBack, real keyboards/IME, touch ergonomics and installed PWA |
| Android / iOS | Both prebuilds; GitHub Android AAB and Xcode 26+/release simulator compilation gates | Exact-head CI results must be read from checks; signed store/device acceptance remains BLOCKED |

No actual production payment, booking, destructive migration or synthetic customer transaction was used as a test. Browser fixtures point at an immutable local export and intercept the Supabase endpoint; production previews are not used as a staging backend.
