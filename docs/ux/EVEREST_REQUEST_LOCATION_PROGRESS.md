# Request location follow-up — 29 October 2026

## Evidence and decision

PR #113 is ready for review: source `081ba108a9ffe11784d2f44cb96e209797670caa` passed the complete Chromium/WebKit discovery workflow [40765406843](https://github.com/daksh-07/-Everest-Local-App/actions/runs/40765406843) and performance recovery workflow [40765406920](https://github.com/daksh-07/-Everest-Local-App/actions/runs/40765406920). This supersedes its earlier pending CI note. Those results belong to that source, not this follow-up.

Fresh inspection of `app/request.tsx` found four Australia fallbacks: initial country, profile preload, device address, and manual lookup. There was no editable country. The `create_service_request_v5` → v4 → v3 source contract already accepts country; no backend or payment modification is necessary. State/region remains required by the existing request contract. This change does not establish support for every country's address format or marketplace coverage.

Decision: show country explicitly, prefill only the actual saved profile country, require missing input before geocoding, and show country on the confirmed-address card. Keep current steps, URLs, timing, pricing, auth, request idempotency and authoritative dispatch lifecycle. Alternatives rejected: infer country from device locale (can be wrong), remove state requirement only in the client (server still requires it), persist full address drafts without a reviewed privacy lifecycle (precise location would outlive the session).

The persistent field labels, optional markers and focused error recovery follow the existing W3C form guidance in `EVEREST_RESEARCH_EVIDENCE.md`. This is an engineering/heuristic decision; no human usability study or A/B test was performed.

## Implemented

- Removed Australian fallback from request entry and shared service-address geocoding.
- Actual profile country remains editable; missing profile country stays empty.
- Required fields identify and focus missing values; Continue can explain missing address data.
- Visible labels for address fields; alphabetic postal codes accepted; city/postal code marked optional.
- Address edits invalidate the previous coordinates/confirmation. Profile loading cannot overwrite manual edits.
- Lookup freezes address inputs and conflicting actions until its bounded result; action-specific progress distinguishes device lookup from manual confirmation.
- Confirmed card discloses country; existing submit payload forwards the normalized confirmed country and pin.

## Validation record

Local validation passed: 517 unit/security tests; TypeScript; ESLint (zero errors, 11 existing warnings); static audit (97 routes); migration audit (244 canonical migrations); web export; and iOS/Android JS/Hermes exports. These are not native device/binary tests. The final Chromium matrix passed all 12 configurations, 24 axe scans (pending + confirmed), 36 geocoder interactions and 12 synthetic submissions, with zero page errors, horizontal overflow or axe violations. Screenshots/report are in `evidence/request-location/`. CI for this follow-up is pending until publication. `scripts/verify-request-location.mjs` exercises the actual exported app with synthetic profiles/session and intercepted geocoder/RPC transport. It checks a profile with/without country, missing-country focus/no lookup, pending lock, failed lookup with retained alphanumeric postal code, retry, country edit/reconfirmation, and one synthetic submission carrying the new country/pin. Matrix: three modes × light/dark × 320/390 viewport widths. The workflow also runs WebKit. Fixture results are not real Supabase or provider acceptance.

Earlier local runs exposed intermittent loss of corrective focus during validation rendering. The component now reapplies focus after the error has committed; the final matrix retained the focus assertion and passed. The initial startup fixture typed before service loading had settled; it now waits for service readiness. No assertions were removed.

Native binary builds, physical devices, VoiceOver/TalkBack, actual geolocation permission denial, live staging submissions and full international payment/coverage acceptance remain unverified. Photos, pricing, timing and private content are never sent to a real service in the fixture.

## Next priorities and rollback

This branch is stacked on PR #113; review and merge that prerequisite first, then retarget this follow-up to the production integration branch. Revert the follow-up commit to roll back; no schema rollback.

Request draft recovery remains open: specify opt-in/device storage, account isolation, expiry, logout/success cleanup, stale date handling, service revalidation, pending-success reconciliation, and exclusions for photos/precise coordinates/payment details before persisting it. Do not autosubmit or restore a previously confirmed pin without review. Country-aware discovery before pagination and authenticated business/transaction acceptance remain next in the whole-product roadmap.

## First published CI outcome

Source `4a96ec5` passed Chromium request-location and performance recovery CI. WebKit passed several configurations but timed out waiting for a missing-country alert. This is unresolved; WebKit must not be called passed. Added failure-only field/DOM/screenshot diagnostics while preserving the same assertions. A local WebKit download succeeded, but its system libraries were unavailable and the dependency installer failed with a runtime `setgroups` restriction. CI remains the usable WebKit environment.

The diagnostic rerun reproduced focus falling back to `body`. Inspection of the installed React Native Web ScrollView `_handleScroll` confirmed that `keyboardDismissMode="on-drag"` dismisses the keyboard on every scroll event, including focus-driven scrolling. Request now uses `none` on web and retains `on-drag` on native. This addresses corrective focus and avoids typing being interrupted when the browser scrolls an input into view. Cross-browser rerun remains required.
