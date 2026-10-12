# Experience V2 — Release A

Baseline: `35744b0b1ddbcff86b0d217ec8b7b0b12a0e9aff`, confirmed on main and the public production `/build-info.json` on 12 October 2026 UTC. The commit's 13 October date is Australia time. Fresh checkout; no existing local edits. Branch: `codex/experience-foundation-2026-10-12`.

## Implementation

- Retain swipe-adjacent Explore layouts, but load their feeds/media only when opened. Inactive lists cannot record content views.
- Load My Everest when visible. Suspend Messages fetching/polling when another route covers the retained pager, while preserving thread state and optimistic messages.
- Start the page pan only after recognition, so vertical scrolling/taps cannot cancel an in-flight transition.
- Mount the destination's adjacent window after swipe settlement, including two-page flicks. Preserve routes, six scenes, five navigation destinations and scroll context.
- Reapply browser `inert` when scenes mount. Selected tab labels use the same accent as selected icons; narrow navigation labels remain readable.

No database, RLS, payment, dependency or native build-setting changes.

## Before / after evidence

Three fresh Chromium contexts per exported build on the same machine, 390 × 844, real anonymous production Supabase reads, fixed four-second observation after Home controls appear. This is browser emulation, not an iPhone/Android device benchmark.

| Measure | Baseline | Release A |
| --- | ---: | ---: |
| Home startup REST requests, each run | 20 | 6 |
| DOM nodes after observation, each run | 302 | 226 |
| Median time to Home menu control | 580 ms | 583 ms |
| Long-task total, three runs | 292 / 292 / 296 ms | 288 / 298 / 256 ms |

The confirmed improvement is 70% fewer startup REST requests and fewer mounted data-driven elements. No startup-latency, 60 fps, native motion or long-task improvement is claimed. Expo's initial JavaScript execution remains material. Public production capture had three long tasks of 122, 70 and 62 ms; it is not directly comparable to localhost timing.

Rendered QA checks the request boundary, active scene inert state, Explore → Clips drag, vertical gesture rejection, Home return, menu open/close, touch targets and document overflow at 320, 360, 375, 390, 430, 768 and 1440 px. Run `scripts/verify-discovery-foundation.mjs` with an external Playwright installation. Capture files and raw measurements are in the session's `/workspace/scratch/everest-qa` folder. Before screenshots include Home at seven widths and anonymous Search, Shop, Auth, Available Now, and missing-ID detail recovery pages.

## Baseline quality and limitations

- `npm ci`, typecheck, web build, static audit (644 files / 96 routes), migration audit (235 migrations): passed.
- ESLint: zero errors, 12 existing warnings.
- Baseline complete Node test suite: 409 passed, one failed. CRM OAuth test still expects a direct membership query; the current implementation uses a server permission RPC. This is recorded before any repair.
- Focused Release A navigation/Home/messaging tests: 36 passed.
- Initially, WebKit's system-library installation was blocked by environment privileges. During Release B, a private tooling runtime supplied the missing libraries and the Home/Search WebKit checks passed. Native simulators, real devices, VoiceOver/TalkBack and authenticated customer/business fixtures remain unavailable.
- Vercel project is `prj_L57g1cxp3MPMWr0NuoJeh7P8sXHh` in `dakshgolani5-4632`. Deployment API returned scope 403; scoped CLI fallback had no credentials. GitHub integration previews must be verified independently through PR checks/public build provenance.

## Outstanding work verified in GitHub

| PR | Current state | Integration decision |
| --- | --- | --- |
| 95 / 96 | Merged | Preserve Home/chat baseline |
| 97 | Open, conflicting with newer main | Do not merge; guest-search/Live permission migrations and Edge Function/payment testing require coordinated staging |
| 93 / 94 | Draft | Isolate India rollout; phase 2 includes a migration and two functions despite body wording implying no schema mutation |
| 77 | Open | Compare with already-merged work-first PR 79 before further business changes |
| 73 | Open | Compare with already-merged operations PR 74; avoid duplicate authority |
| 78 / 80 | Open | Security/privacy/reporting work needs independent backend review |

The current service-role permission helper checks active membership in its role fallback, but a permission override is evaluated first. PR 97 addresses that existing boundary. Release A does not alter or claim to resolve it. The Live 45-second UI expansion interval must not be confused with the reported 120-second dispatch offer deadline. India payments must remain gated; no country/payment expansion is released here.
