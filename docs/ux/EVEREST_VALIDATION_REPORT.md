# Validation — 29 October 2026

## Completed local checks

- TypeScript: passed.
- ESLint: zero errors; 11 existing hook warnings.
- Node unit/security suite: **516 passed**, including seven actual-geocoder isolation tests (AU/Canada/India, missing country/locality, transport failure/retry/cache, service address country and malformed coordinates, empty-response retry).
- Web production-style export: passed.
- iOS and Android JS/Hermes bundle exports: passed. These are not native binary builds or device acceptance.
- Static navigation audit: 97 routes validated. Migration audit: 244 canonical migrations. No migration edits/applies. `npm ci` generated legacy test aliases; the repository cleanup script removed all 95 aliases after tests.
- Focused Chromium fixture matrix: **48 scenario groups, 72 layout checks, 72 axe scans** across DEFAULT/PULSE/CLASSIC, light/dark and 320×844, 390×844, 320×568, 1280×800. **Zero page errors, zero horizontal overflow, zero axe violations.** See `evidence/after-report.json`.
- Broader Chromium discovery: **10 scenarios, 96 loaded + 48 empty + 48 error layouts, eight axe scans**, zero page errors; report in `evidence/discovery-report-chromium.json`.
- Preview smoke: published Home, location controls and missing-field focus verified through the cloud browser; no writes or actual location permission requested.
- Baseline: 12 layout combinations captured at deployed source; screenshots in `evidence/location-before-*` and `evidence/search-before-*`.

## What the browser fixtures exercise

The actual exported application is mounted with network routes intercepted. Missing locality/country focuses the relevant field without sending a lookup. Manual lookup shows pending state on its own button, disables conflicting inputs/actions, preserves entries after empty response, retries with Enter and updates browsing location. Country is included in the lookup; guests do not save a profile. Empty search can return to categories; quote request opens auth and, after a synthetic login, returns to `/request` and consumes its saved return destination. No real credentials, location requests, customers, messages or financial transactions are used.

Mocked login is UI integration evidence, not verification of real Supabase Auth configuration. The geocoder fixture is not a live provider availability test. Removed AU-only restriction does not establish global marketplace coverage.

## Limits and unsuccessful attempts

The standard local Playwright browser download returned invalid/truncated archives. An isolated npm-distributed Chromium runtime was used instead; no application dependency was added. A later broad-suite launch failed with a truncated local executable (SIGSEGV before page load); fresh decompression repaired the executable. Initial fixture failures exposed the real negative-cache bug and the guest-auth handoff gap. Expanded axe scans found an unnamed Search loading indicator. These were fixed and the expanded matrix then passed.

Initial WebKit CI completed the focused UI scenarios but failed the zero-error assertion when location-triggered reads were interrupted by hard navigation. The fixture now uses the existing request-settling helper before navigation/teardown; error assertions are unchanged. The rerun must pass before WebKit is reported as successful.

WebKit local runtime, physical iPhone/Android, VoiceOver/TalkBack, native binary compilation, production writes and live Stripe acceptance were not completed. CI is configured to run Chromium/WebKit; pending jobs must not be reported as passed. Automated axe checks are limited to the inspected states and do not establish full WCAG conformance. No performance or conversion improvement is quantified.

## Before / after examples

| State | Before | After |
|---|---|---|
| Manual location | [Screenshot](evidence/location-before-light-default-320.png) | [Retained error and retry](evidence/location-retry-light-default-320.png) |
| Empty service search | [Screenshot](evidence/search-before-light-default-390.png) | [Recovery actions](evidence/search-after-light-default-390.png) |
| Dark Classic location | [Screenshot](evidence/location-before-dark-classic-320.png) | [After](evidence/location-retry-dark-classic-320.png) |

Baseline timing/step instrumentation was not collected, so no measured speed gain or typing reduction is claimed. Error recovery and intent preservation are demonstrated behavioural changes.
