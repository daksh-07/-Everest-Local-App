# Everest product audit — 28 October 2026

## Scope and evidence boundaries

This is the start of the requested whole-product transformation, not a completed whole-product audit. Fresh source enumeration covers **97 screens and 53 components**. Fresh live walkthroughs cover guest Home, location entry and Car search; fixture verification covers changed interactions. Other routes are explicitly inventory-only. Prior reports are historical evidence, not new test results.

Production was independently resolved through Vercel to deployment `dpl_q5PRacsE9dSYozLnXkVayvR8rWVA`, source `ed013dec0e1a11ad628663bc0fd723a8600ce7ee`, READY. `main` remains `2a20c7388cd76944b095557e2b1e47c6920ce97a`. Production is the integration branch containing merged PR #112. PR #111's description still says an older production SHA; do not use that description as deployment provenance. Nine open PRs were inspected through GitHub metadata; the first 100 branch names were returned, not the entire branch history. Payment/India draft PRs remain separate. No feature-flag service was queried; source experience preferences are not experiment assignments.

Verified package manifest: Expo ~54.0.37, Expo Router ~6.0.24, React 19.1.0, React Native 0.81.5, RN Web ~0.21.0, Supabase JS ^2.57.4, TypeScript tooling. Stripe is used through backend functions; dependencies alone do not establish live payment readiness. Existing `docs/performance-recovery/followup/README.md` records two production discovery migrations and remaining staging/device limits. None were reapplied.

## Assessment rubric

Severity: P0 prevents secure core task completion; P1 blocks or materially misleads a significant journey; P2 adds recoverable effort; P3 polish. Evidence: O = observed live, C = inspected code, F = executed fixture, H = expert hypothesis. Complexity S/M/L is engineering judgment. Confidence high requires direct evidence; impact is expected, not measured conversion. Prioritize severity, affected task, confidence, risk, effort. Do not assign screen-level numerical scores where inspection is incomplete.

| ID | Area / file | Problem and affected users | Severity / evidence | Change / alternative | Effort / risk | Status / validation |
|---|---|---|---|---|---|---|
| UX01 | `components/CustomerLocationSelector.tsx`, `lib/customer-location.ts` | Manual entry silently fixes Australia and web geocoding restricts AU; non-AU users cannot express country | P1 O+C | Explicit country, remove AU-only web bound; reject countryless locality. Alternative auto locale rejected because it can be wrong | S / medium shared geocoder | Implemented; country and address regression tests, rendered fixture |
| UX02 | Location selector | Error says check country but there is no country control; placeholders disappear, optional inputs not identified, missing input not focused | P2 O+C | Persistent labels, optional labels, error focus. Keep existing component and theme system | S / low | Implemented; keyboard/focus fixture |
| UX03 | Location selector | Manual action shows spinner on GPS action; changing fields during lookup can disagree with submitted values | P2 C | Per-action progress and busy semantics, lock inputs while pending, preserve values after errors | S / low | Implemented; held lookup fixture |
| UX04 | `app/index.tsx` | Local business query falls back to all businesses and matches administrative names without country; local heading overstates proximity | P1 C | Neutral heading + explicit coverage caveat now. True country/service-area filtering before pagination is required next | M / backend dependency | Country-scoped business directory/available-now implemented in follow-up; service-area/product eligibility remains open |
| UX05 | `app/search.tsx` | Home → Car → empty service search has no direct recovery action | P1 O+C | Browse categories, contextual request action, remove photo filter. Alternative broaden query automatically rejected because it obscures intent | S / low | Implemented; empty/recovery navigation fixture |
| UX06 | `lib/customer-location.ts` | Empty lookup is cached ten minutes; retry repeats cached failure | P1 F+C | Cache only non-empty, non-error payloads; successful cache retained | S / low | Implemented; actual geocoder regression + browser retry |
| UX07 | `app/request.tsx` | Request initializes country to Australia, including restored profile path; native/web address requirements still assume suburb/state | P1 C | Next: explicit country-aware request address and review. Do not silently alter existing payment/service market rules | M / medium | Implemented in #114; no claim global booking support |
| UX08 | `app/request.tsx` | Description/location are component state; no persistent draft storage found in inspected file | P1 C/H | Next: user-scoped expiring draft, editable resume, clear on success/logout, exclude payment secrets | M / privacy | Implemented in #115 with intercepted browser interruption tests; native force-kill and hosted staging remain unverified |
| UX09 | Production/source records | Default branch and production differ; old release record can lead to regression or unsafe rollup | P1 verified metadata | Base new work on production integration, target that branch, document SHA and pending gates | S / low | Applied to this branch; no merge/release |
| UX11 | `app/search.tsx` | Quote shortcut loses guest intent at sign-in | P1 F+C | Persist `/request` through existing web/native auth return mechanisms | S / low | Implemented; fixture signs in and verifies request destination |
| UX12 | Search/loading | Indeterminate search spinner has no accessible name | P2 F+C | Label search and location progress indicators | S / low | Implemented; axe matrix rerun |
| UX10 | Entire product | Physical native, screen-reader and real staging transaction acceptance unavailable in this pass | P1 validation gap | Existing isolated fixture/SQL tests supplement but cannot replace these gates | L / external prerequisite | Open |

## Information architecture and design decisions

Keep the five customer tabs and their current URLs for this batch. Home already leads with search, request quotes, urgent intent, and service categories before community. Business Today already puts job/message counts and Needs attention before Sales & CRM; preserve this rather than redo the same hierarchy. These are source-backed decisions, not proof of usability success.

Keep Shop accessible from Home and search. Test its prominence with genuine tasks before adding a sixth tab. Keep community below marketplace actions. Empty search should offer recovery at the point of failure. Never silently broaden service area or imply a quote request guarantees a provider. Keep transaction status authoritative and leave Stripe, payouts, fees, subscriptions, RLS and dispatch untouched.

## Structured friction walkthrough coverage

Steps below are only counted where actually traversed; no invented completion times or consenting human participants.

| Scenario | Fresh evidence / outcome | Next validation |
|---|---|---|
| 1 First launch | Live guest Home displays value, search, quote and urgent actions without login | Complete onboarding/auth/error/recovery matrix |
| 2 Urgent cleaner | Live Home urgent action visible; full dispatch not run | Test request → match → response in isolated staging |
| 3 Car detailer, unfamiliar terms | Live one category tap opens `/search?q=Car&tab=SERVICE`; empty result and no direct recovery | New recovery actions fixture tested; taxonomy/synonym quality still open |
| 4 Cheapest appropriate provider | Search/filter source inventoried only | Verify comparable total price, serviceability and sorting |
| 5 Compare businesses | No fresh complete walkthrough | Observe back restoration and comparable facts |
| 6 Trust provider | Live Home exposes verified label; exact verification evidence not freshly traced | Explain what verification means; review eligibility/source |
| 7 Shortest quote request | Home CTA observed; source request inspected for country/draft | Count inputs after controlled auth and actual taxonomy |
| 8 Buy product | Home product card observed; no checkout performed | Product/cart/order fixture suite + staging Stripe test mode |
| 9 Repeat booking | Routes enumerated, not executed | Verify eligible rebook context and explicit price/date review |
| 10 Urgent business opportunity | Existing operations evidence located, not rerun yet | Timed acceptance and uncertain network outcome |
| 11 Create listing | Service/product editor enumerated | Required inputs, failed upload and retry |
| 12 Delegate work | Business operations/employee routes enumerated | Role-scoped assigned job with negative access checks |
| 13 Location denied/unavailable | Manual entry observed live; new manual path fixture tested | Physical permission-denial and settings recovery |
| 14 Poor internet | Held/empty geocode fixture; no fresh whole-app throttled profile | Search, feeds, Live and messaging under interruption |
| 15 Interrupted form | Location input retained after lookup failure in fixture; request persistence gap from code | Reload/app-background draft restoration and privacy |

No A/B results, conversion gains or speed improvements are claimed. Existing reports with timings remain attached to their original source/device/sample, not attributed to this patch.
