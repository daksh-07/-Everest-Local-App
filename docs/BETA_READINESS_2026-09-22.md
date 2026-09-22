# Everest Local private-beta readiness — 22 September 2026

## Decision

**NOT READY as a deployed transactional private beta.**

The reviewed source is **READY WITH SPECIFIED LIMITATIONS for a controlled staging release and real-role validation**. The fixes are local, CI has not run on their exact commit, no clean disposable staging database is available, and production still serves `c04b8abbb2e38bbec6cfd193c42cb8e61cdf577f`.

## State separation

| State | Exact evidence | Conclusion |
| --- | --- | --- |
| Implemented in source | Local branch `fix/private-beta-20260922`, based on `c04b8ab` | Checkout returns, web recovery, webhook verification and service dispatch are implemented locally |
| Tested locally | TypeScript, ESLint, 113-test suite, audits, Expo Doctor and web export | Source gates pass except the full Deno dependency check |
| Passed CI on exact commit | No CI run exists for this local branch | **Unverified** |
| Deployed | Public build metadata reports `c04b8ab`; Supabase serves the prior versions | New work is **not deployed** |
| Verified through real journey | Public desktop home and Explore inspected; no authenticated role, Stripe or iPhone session available | Transactions are **unverified** |

GitHub `main` remained `c04b8abbb2e38bbec6cfd193c42cb8e61cdf577f`. CI run 718 passed on that SHA, but its workflow did not run two existing driver regression files. The local workflow now runs every `tests/*.test.mjs` file.

## Interface assessment

Only the deployed desktop web app was directly inspected. Phone-sized Safari, installed PWA, native iOS/Android, authenticated customer/business/driver screens and admin MFA remain **UNVERIFIED**. Source review is labelled separately and is not presented as visual evidence.

| Screen and task | Evidence | Finding and impact | Severity | Resolution |
| --- | --- | --- | --- | --- |
| Home and navigation | Observed on deployed desktop | Premium black/warm-white/beige styling is coherent and primary actions are understandable. Content feels sparse on a wide desktop canvas. | P2 | Retain direction; apply a desktop max-width after mobile verification. |
| Explore/search | Observed on deployed desktop; screenshot captured | Page ended in “We couldn't load results. Please try again.” Public discovery is unreliable in the deployed build. Root cause was not proven. | P0 | Reproduce with network/API telemetry in staging before release. |
| Cart checkout | Source review | Native `Alert` is ineffective on web, errors were transient, and repeat taps could start duplicate client attempts. | P0 | Added accessible in-page errors, busy guard, fulfilment notice and 44px quantity targets. |
| Booking cancellation | Source review | Web confirmation depended on `Alert`. | P1 | Added in-page keep/cancel confirmation and repeat-tap guard. |
| Service request location | Source review | Dispatch requires coordinates, but creation collected only suburb text. Coordinates cannot be added after booking. | P1 | Added optional permission-based location capture before posting, with clear dispatch consequence. |
| Customer dispatch | Source review | Backend existed but customers could not initiate or recover dispatch. | P1 | Added BOOKED-request initiation and owned-job status/recovery. Backend retains confirmed-booking and accepted-quote checks. |
| Driver service offers | Source review | No capability, location, offer, expiry or response UI existed. | P1 | Added setup and offer controls. Copy calls ETA a geographic estimate and location a point update. |
| Orders, business, driver onboarding, messages, account, admin/MFA | Source review only | Routes and state handling exist, but real rendering and role journeys were not observed. | P1 | **UNVERIFIED** pending disposable role accounts and browser matrix. |

The deployed Explore error screenshot is stored with the audit evidence outside the repository as `everest-search-before.jpg`.

## Priorities for today

| Problem or feature | Existing state | User benefit | Priority | Dependencies | Effort | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- |
| Deployed Explore failure | Reproduced; cause unconfirmed | Users can discover real supply | P0 | Staging/API logs and deploy permission | 1–3 h after telemetry access | Anonymous search loads; failure state retries successfully |
| Checkout return destinations | Local fix uses Orders/Bookings and trusted origin | User returns to authoritative status | P0 | Set `CHECKOUT_APP_ORIGIN`; deploy functions | <1 h config + validation | Test success/cancel land on existing pages; webhook determines success |
| Webhook signature verification | Local async crypto fix | Valid webhooks process; forged signatures fail | P0 | Function deploy; Stripe test webhook | <1 h | Valid event is idempotent; invalid signature returns 400 |
| Complete regression CI | Local workflow includes all tests | Prevents driver regressions escaping CI | P0 | Safe publication path | <15 min | CI reports all 113 tests on exact commit |
| Dispatch read contract | RLS existed; authenticated SELECT grants missing | Owners see jobs/offers | P0 | Additive migration in staging | 1 h | Customer/Driver A see owned rows; unrelated users and anon see none |
| Dispatch client | Implemented locally | Customer requests provider; driver responds | P1 | Migration, approved driver, active service, locations | 2–4 h staging validation | BOOKED+CONFIRMED request creates one job; offer expiry/accept/decline are safe |
| Request location consent | Implemented locally | Enables distance/radius matching | P1 | HTTPS browser geolocation | <1 h | Denial leaves request usable; permission saves valid coordinates |
| Web cancellation/errors | Implemented locally | Users can recover without native dialogs | P1 | Browser validation | <1 h | Confirm required; failures retry; double taps do not duplicate |
| Real launch supply | One active verified business; zero active services/products/locations | Beta users can transact | P0 operational | Real merchants, catalogue, service areas | Product decision | Intended area has approved supply and support owner |
| Notifications | In-app records; no demonstrated push/background delivery | Timely status awareness | P2 | Notification architecture | 1–2 d | Events arrive once and link to authoritative state |
| Saved/repeat actions | Saved businesses/products exist; repeat booking unproven | Faster return use | P2 | Core stable | 1 d | Owner-scoped save; repeat creates fresh reviewable action |
| Loyalty/referrals/social/advanced AI/analytics | Nonessential | Limited near-term value | Later | Core operations | Multi-day | Reassess after successful beta transactions |

## Implemented repairs

1. Complete test discovery in local and CI scripts, including driver availability and licence suites.
2. Case-insensitive SQL assertions without weakening required invariants.
3. HTTPS checkout returns to existing Orders/Bookings pages. Missing or unsafe `CHECKOUT_APP_ORIGIN` fails closed with 503 before financial records.
4. Deno-compatible asynchronous Stripe webhook signature verification.
5. Web-safe cart failure/retry, repeat-tap guard, fulfilment notice and tap targets.
6. Web-safe booking cancellation confirmation.
7. Additive dispatch migration granting only SELECT on five client-readable tables while ownership RLS remains. Internal candidate, configuration, audit and queue functions stay private.
8. Repaired `set_service_provider_capability`, which referenced dropped `service_provider_profiles`. Replacement requires an operational driver plus membership of the active verified business owning the active service.
9. Customer dispatch initiation/status and driver location/capability/offer actions.
10. Optional permission-based customer location capture before request submission.

## Backend and security observations

- All 60 public application tables had RLS enabled.
- No public SECURITY DEFINER function lacked an explicit search path; no trigger-returning public function was executable by anon/authenticated.
- `is_admin()` requires the fixed identity, password authentication and AAL2. One verified factor exists; logout/login/TOTP re-verification was not executed and no secret was read or reset.
- Dispatch cron was active and recent executions succeeded, but there were zero jobs and provider locations. Empty cron execution does not prove dispatch.
- Authenticated SELECT on `service_dispatch_jobs` was denied in the deployed database. The local migration adds the grant under the existing owner/provider RLS policy.
- The deployed capability RPC references a table removed by a later migration. The local replacement removes that dependency.
- Both ABN Edge Functions remain deployed. The old function was not deleted because production usage was not proven absent.
- The available Supabase branch reported failed migration metadata and was not safe disposable staging, so no fake transactions were inserted.

## Journey status and limitations

| Journey | Supported in source | Unverified or unavailable |
| --- | --- | --- |
| Customer service | Discovery, request, quotes, acceptance, booking/deposit, messages, completion/review; dispatch client added | No active services; no role E2E; refund separate; dispatch needs pre-booking coordinates |
| Customer product | Product/cart/order, server totals/reservations, Checkout and webhook authority | Zero active products; no test round trip; deployed return routes remain wrong |
| Business | Onboarding, ABR verification, service/product and opportunity/order interfaces | No disposable verified-business journey; operational queue usability unobserved |
| Driver | Compliance, availability and delivery work; service-offer UI added | Applications are DRAFT; no eligible location/provider; point location only |
| Admin | Password + existing-factor AAL2 gate and operations source | Logout/login/rechallenge and dashboard operations unverified |

Payment creates ordinary Stripe Checkout Sessions on the platform account and marks orders/bookings paid only from signed webhook events. The schema has fee and payout ledger columns, but source has no Stripe Connect onboarding, destination/separate transfer, seller payout execution, refund API or dispute workflow. Merchant responsibility, commission, payout schedule, refund authority and disputes need explicit decisions before real-money marketplace use.

ETA is a straight-line geographic proxy using configured speed, not live traffic or routing. Browser location is a foreground point update, not background tracking. Push/background notification delivery was not demonstrated. Expo web export passed, but iPhone Safari, Android Chrome, installed PWA and native builds were not tested.

The app depends on Supabase, Stripe and ABR. Checkout/webhook code records privacy-limited error context and admin can inspect Stripe-event status, but beta still needs a named support owner, daily failed-webhook review, refund/cancellation escalation, privacy/account-deletion handling and rollback operator. No paid monitoring was added.

## Validation results

Results apply to the local worktree on 22 September 2026, not production.

| Check | Result |
| --- | --- |
| TypeScript | PASS |
| ESLint | PASS |
| Complete regression | PASS — 113 tests, 0 failures/skips |
| Security suite | PASS — 56 tests |
| Dispatch suite/audit | PASS — 28 + 2 tests |
| Business verification | PASS — 19 tests |
| Static audit | PASS — 229 files, 39 routes |
| Migration audit | PASS — 123 source migrations; does not prove remote execution |
| Expo Doctor | PASS — 18/18 |
| Expo web export/artifact verification | PASS |
| Full Supabase/Deno typecheck | BLOCKED — `esm.sh` dependency downloads refused |
| Local browser build | Build passed; cloud browser could not reach local preview |
| Production desktop smoke | Home loaded; Explore failure reproduced |
| iPhone Safari/mobile web | NOT EXECUTED |
| Stripe test product/service round trip | NOT EXECUTED |
| Admin logout/login/TOTP | NOT EXECUTED |
| Separate-role RLS/dispatch integration | NOT EXECUTED — no safe staging data environment |

## Controlled release and rollback

No push, PR, migration, Edge Function or hosting deployment was performed because publication may trigger deployment and is explicitly restricted.

Release order after approval:

1. Create or repair a disposable Supabase preview branch and snapshot current schema/function versions.
2. Set `CHECKOUT_APP_ORIGIN=https://everest-local-app.vercel.app` or the confirmed release origin.
3. Apply the additive migration; deploy checkout, service-checkout and stripe-webhook from the exact reviewed commit.
4. Run Deno checks where dependencies resolve, then role-isolation/dispatch and Stripe success/cancel/expiry/duplicate-webhook tests.
5. Deploy a private web preview, verify iPhone Safari and desktop, then promote the exact artifact only if P0 tests pass.
6. Insert no fake production records. Onboard only approved real launch supply and keep invitations narrow.

Rollback: restore prior web and Edge Function versions. The additive migration should normally remain: SELECT grants are constrained by RLS. If withdrawn, revoke the five authenticated SELECT grants and restore a valid capability function through a new migration; do not rewrite applied history.
