# Journey completion checklist — 29 October 2026

Status labels apply to the complete journey, not the presence of a screen. Mocked browser acceptance does not establish real payment, delivery, notification, or physical-device acceptance.

## Verified starting point

- Production deployment was re-read: READY, source `ed013dec0e1a11ad628663bc0fd723a8600ce7ee`.
- #113 is open, mergeable and unmerged at `081ba108`; workflows 40765406843 and 40765406920 remain successful.
- #114 is open, mergeable and unmerged at `07f14cc`; workflows 40845692620 and 40845692990 remain successful.
- `main` is still an ancestor of deployed integration (25 commits behind in the fresh GitHub comparison). Do not roll back to the default branch.
- #105 remains open at `29ab83d`, targets `main`, and GitHub reports a merge conflict. Its transaction/release evidence belongs to its own source. Reconcile it against integration before importing backend/payment changes; do not assume its PR-body results validate this branch.

## Major journeys

| Journey | Exact current status | Evidence / remaining gate |
|---|---|---|
| Guest Home → search → empty-result recovery | Implemented but partially validated | #113 Chromium/WebKit and live guest walkthroughs; production release still pending |
| Browsing location denial/manual country/retry | Implemented but partially validated | #113 rendered fixtures; physical permission/settings recovery outstanding |
| Request country/address confirmation | Implemented but partially validated | #114 both browser engines; physical keyboard/GPS acceptance outstanding |
| Persistent request text, service choice, address and budget | Implemented but partially validated | New implementation and Chromium interruption matrix; final CI and native lifecycle acceptance pending |
| Durable request photo attachments | Not implemented | Drafts explicitly tell users to reattach photos; no reliance on temporary picker URIs |
| Uncertain request posting → status/retry | Implemented but partially validated | Immutable persisted payload/key, status lookup and explicit retry; mocked committed/lost-response and uncommitted cases exercised; live staging gate remains |
| Country-aware business discovery | Not implemented | Home currently matches administrative names without country and falls back broadly; country must be constrained before limit/offset |
| Country-aware service/product search | Not implemented | Existing universal_search/shop_products have no country argument; no client-side post-pagination filtering can claim completeness |
| Currency/market checkout eligibility | Blocked, with the precise dependency | Production service/membership payment constraints enforce AUD; no verified non-AUD checkout path. Requires reviewed market/payment work and isolated acceptance; do not relabel prices from country |
| Search → provider → request → quote | Implemented but partially validated | Routes and existing request/quote fixtures exist; actual multi-account staging acceptance not run |
| Quote expiry/cancel/review/accept → booking | Implemented but partially validated | Existing server guard/unit coverage; reconcile #105 and run isolated customer/provider acceptance |
| Booking → Stripe payment → server confirmation | Blocked, with the precise dependency | Connected project listing has no separate Everest staging project; the only branch record is default main (historical MIGRATIONS_FAILED metadata dated 17 September; the production project itself reports ACTIVE_HEALTHY). No healthy isolated branch was found. Need a healthy isolated Supabase + Stripe test-mode deployment/webhook and test accounts; production money must not be used |
| Job completion → review → rebook | Implemented but partially validated | Existing routes/authority tests; full staging lifecycle and deliberate fresh date/price/location review required |
| Product → variant/cart → checkout → fulfilment | Implemented but partially validated | Existing code and #105 proposal/evidence; #105 conflicts and live test-mode acceptance remain unresolved |
| Business opportunity → response → quote | Implemented but partially validated | Existing scoped handlers/tests; fresh background/urgent notification and full staging response acceptance outstanding |
| Business booking → assigned job → complete | Implemented but partially validated | Existing checklist/confirmation fixture and SQL authority evidence; native employee acceptance outstanding |
| Business payment/payout eligibility | Blocked, with the precise dependency | Readiness requires Stripe test accounts/identity states and isolated webhook events; no live payout changes authorised |
| Today/calendar/availability/CRM | Implemented but partially validated | Existing jobs-first hierarchy retained; complete task-level acceptance remains to run |
| Employee permissions/delegation | Implemented but partially validated | Existing scoped SQL checks supplement but do not replace multi-user staging/device acceptance |
| Messaging/notifications/community | Implemented but partially validated | Existing source/fixture evidence; real push/background delivery and physical keyboard/media acceptance outstanding |

No end-to-end production transaction is marked fully validated. No conversion or latency improvement is quantified. An unmerged PR is not production.

## Market evidence (read-only)

Production aggregate `businesses GROUP BY lower(trim(country)), status, verification_status` returned one ACTIVE/VERIFIED Australian business. The live constraint catalog confirmed AUD-only checks for service_payments, business/customer memberships/packages and membership billing history. CRM currency fields allow three-character currencies; that alone is not marketplace charging support. A second aggregate confirmed the active verified business accepts requests/orders but has zero active service listings. Empty service discovery is therefore not proof of a broken search UI; genuine bookable supply is absent in this snapshot. No live listings were invented or modified. No customer records, credentials or financial identifiers were read. No SQL mutations were performed.

## Safe integration and release gates

1. Review #113 against deployed integration and merge only with the owner's required release authorisation.
2. Retarget #114 to integration after #113; rerun its checks before merge.
3. Draft recovery is stacked on #114. Retarget after its prerequisite lands; keep schema/security/payment policy unchanged.
4. Country discovery must retain explicit empty states and country constraints before pagination. It must not imply provider availability from a country name or from profile location alone.
5. Resolve #105 on a separate review branch; preserve authoritative fees, payment states, inventory and dispatch. Review financial/security changes before integration.
6. Complete staging payment/webhook, employee and urgent-response acceptance, then physical devices. Release readiness remains **not established** until these gates pass.

## Practical device checklist

On physical iPhone Safari/PWA, Android Chrome/PWA and native Expo/release builds where available:

- Start a request, type quickly, navigate back immediately, reopen from Home and confirm the latest text survived.
- Add an address/budget/date; refresh or background and lock the device. Resume as the same account; confirm address is editable/unconfirmed and no guessed new schedule appears.
- Force-stop after a save, relaunch, and verify encrypted native recovery. Record time-to-last-durable-save; do not assume OS background grace.
- Let authentication expire, sign in again, and resume. Sign out explicitly, switch accounts, and verify the prior request cannot be resumed.
- Deny location, manually choose country/address, rotate, enlarge system text and use one hand. Check keyboard never covers the active field or submit control.
- Toggle offline during posting. Restore network, check status and retry the same request. Verify one authoritative request/opportunity wave, not only a client message.
- Test stale dates/times, removed services, seven-day expiry and storage unavailable/full.
- Reattach photos after reopening; validate upload failure says the request is already posted and offers Activity.
- Run VoiceOver/TalkBack: labels, missing-field focus, recovery actions, progress and contrast in light/dark/all modes. Test reduced motion.
- With isolated accounts, test real push while foreground/background/phone locked, urgent timeout/acceptance, employee denial, payment cancel/fail/succeed and authoritative webhook confirmation.

Record device/OS/browser/build, actual steps, screenshots, expected/observed outcome and whether a real backend or fixture was used. None of these physical-device checks were executed in this environment.
