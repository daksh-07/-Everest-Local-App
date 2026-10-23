Everest Local — Phase 5 discovery and core UX, verified 18 October 2026.

Started from production/main `d9faf4f62365e3a620effbfc422ad15d7cbd88ea`. Application changes end at `0df9d2f`; the following checkpoint adds browser checks, CI wiring and this evidence. PR #97 was reviewed independently, without merging it. The released #106 Safari messaging and narrow booking fixes remain intact.

| Reproduced issue | Before | Implemented behavior |
| --- | --- | --- |
| Guest discovery permissions | Read-only calls to the configured production API returned HTTP 401 / `42501` for `universal_search`, `is_admin` during business reads, and `service_booking_settings`. | An unapplied discovery-only migration permits verified active marketplace search and only two public booking-setting columns. People/community remain unavailable to guests. |
| Home Shop failures | A controlled Shop failure rendered the successful-empty browse prompt. Feed failure could also prevent sibling data from publishing. | Businesses, Shop and community settle separately; errors have local retry, successful siblings remain visible, and transient refresh failures retain known data. Location failures also have explicit recovery. |
| Business Today combined loading | A CRM failure hid a healthy current job, initialized metrics to zero, and showed “You’re all caught up.” Setup-read failure could gate operations too. | Independent reads and retries; unavailable totals use `—`, combined totals require both sources, and incomplete activity cannot claim caught-up status. Sales no longer depends on task/contact hydration. Existing finance-summary queries are only isolated; no transaction behavior changes. |
| Profile initial load | Each services/products/reviews failure hid an otherwise healthy business identity. | Identity and catalog/reviews load separately. Healthy sections remain usable, reviews distinguish unavailable from empty, each failed core section can retry, and product-image failure preserves its listing. |
| Search same-query loading | Reissuing the same trimmed query removed matching results. The same unconditional clearing ran on retries. | Matching results remain during retry and transient error. Query, tab or viewer changes hide them immediately; superseded responses are ignored; permission loss removes retained results. |

Home keeps its navigation, palette and design identity. Shorter introductory copy, a shorter search hint at 320px, tighter spacing before categories and stronger quote-action text contrast improve the first screen. Accessibility scans also identified missing tab-list containers and an unnamed-role mode switcher; these now have correct roles, and the mode-switch target is 44px. Search retains a visible keyboard focus outline.

| Before | After |
| --- | --- |
| [Home first screen, 390px](before-home-390.png) | [Home first screen, 390px](after-home-390.png) |
| [Shop failure presented as empty](before-home-shop-empty.png) | [Explicit Shop error and local retry](after-home-shop-error.png) |
| [Services failure hides profile identity](before-profile-services-error.png) | [Identity survives services failure](after-profile-services-error.png) |
| [CRM failure hides operational activity](before-today-partial.png) | [Healthy job and follow-up survive](after-today-partial.png) |
| [Same-query reload clears results](before-search-retry.png) | [Failed refresh keeps matching results](after-search-retained-error.png) |

Additional views: [320px dark Home](after-home-dark-320.png), [desktop Home](after-home-desktop.png). Screenshots show the real exported application with intercepted fixture responses, never a separate UI mockup. Home’s Shop-error image is scrolled to the affected section.

Verification completed locally:

- 458 unit tests; TypeScript; web export and export validator; static audit; migration audit. Lint has zero errors and the same 12 existing hook warnings.
- Both Chromium and WebKit: the targeted failure/retry/permission groups, including each Profile child failure, Home section-local recovery, every Today dataset, setup-read isolation, unknown combined totals during delayed CRM booking reads, and Search refresh retention/access loss. Services delayed by 2.5 seconds do not gate Profile identity; a one-second Search retry keeps matching rows visible.
- Each engine: 80 loaded combinations across Home, Search, Profile and Today × 320/375/390/430/1280px × light/dark × normal/reduced motion. An additional 40 empty and 40 error combinations exercise both themes and every width; local retry controls remain usable. See [Chromium matrix](matrix-chromium.json) and [WebKit matrix](matrix-webkit.json).
- Eight WCAG A/AA axe scans per engine, zero violations. Keyboard checks cover Home-to-Search activation and visible input focus; local retry buttons are activated in the browser tests.
- Existing Home and Search regressions: 42 appearance/width combinations each, stale-response cancellation, retained navigation scenes, gestures, all eight Home entry points and account guidance.
- Released Safari regressions: WebKit messaging at 320/375/390/430/1280 in both themes, plus booking loaded/loading/error/retry/empty/filter and enlarged-text checks. Exact results are in the adjacent reports.
- The exact migration executes in disposable PostgreSQL/PGlite. Tests reproduce missing predicate permission, then verify anonymous active/verified-only rows, private-branch exclusion, pagination, the booking-setting column allowlist/RLS, denied writes/admin helper/private preferences, retained signed-in people/community behavior, and main’s actual password-plus-MFA admin predicates. [SQL results](permissions.txt).

The migration reuses the existing authenticated search API with explicit anonymous guards at the private branches and result boundary. `is_admin()` becomes anonymous-executable only because existing public-read RLS evaluates it; it returns false without an authenticated administrator. `is_admin_identity()` and administrative RPCs remain restricted. Booking-setting access grants `service_id` and `instant_booking_enabled`, constrained to active services of active verified businesses. No table-wide setting grant or anonymous write grant is added.

No deployment, merge, production database change, payment flow, Apple Pay, checkout or payment migration is included. Automatic Vercel deployments are disabled specifically for `codex/phase5-discovery-core-ux` before its first push. The migration has not been applied, so the reproduced production guest-permission failures remain until an authorized rollout.

Remaining release work: apply and validate the discovery migration in a controlled staging rollout, run managed Supabase advisors and real anonymous/authenticated membership/RLS journeys, then obtain physical iPhone/Android and screen-reader acceptance. This environment supplied no linked database/admin credentials. Browser emulation and disposable database fixtures do not establish physical-device, native keyboard or production-session acceptance. Existing optional Profile community/growth loaders retain their best-effort behavior; this checkpoint isolates business identity, services, products and reviews.

To repeat the browser and SQL checks, use the pinned isolated tool versions in `.github/workflows/validate-discovery-browser.yml`, serve `npm run build:web`’s `dist` output, and run `scripts/verify-phase5.mjs` and `scripts/verify-phase5-permissions.mjs`. `PLAYWRIGHT_MODULE`, `AXE_MODULE`, `PGLITE_MODULE`, `EVEREST_PREVIEW_URL`, `EVEREST_QA_BROWSER` and `EVEREST_QA_ARTIFACTS` select those runtimes and outputs. The CI workflow runs both engines and uploads the reports/screenshots. API fixture writes are blocked or intercepted; no test writes reach production.
