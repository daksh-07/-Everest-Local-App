# Everest Local — visual refinement for owner review

## Delivery boundary

Baseline: `2c3ef4db3ee4a281d8c0dbb1853eab2e51740665` (main and production verified on 13 October 2026). Branch: `codex/synsation-visual-refinement-2026-10-13`. **Draft review only; no merge or production deployment is authorized by the latest directive.**

PRs #98/#99/#100 are already merged. Their beige/grey/black palette, licensed Bricolage/Inter system and navigation improvements are preserved. The latest handoff and typography report were read first. A new production browser check passed 42 Home mode/theme/width cases and 24 typography cases, including actual loaded faces and font-failure fallback.

Active PRs #93/#94/#101 (India), #97 (marketplace), #77/#73 (business) and #78/#80 (security) were inspected. This branch changes no backend, migration, RLS, payment, country-boundary or dependency file. #97 also edits `app/orders.tsx`; this PR changes its presentation only and must be compared when those branches are eventually integrated. No other branch was rewritten.

Earlier functional work is retained only in local branch `codex/business-discovery-loading-2026-10-13`, commit `49bef46`, excluded from this review branch. It was created under the earlier authorization before the latest feature-protection instruction. It has not been pushed, merged or deployed. Its independent-loading benchmark does **not** describe this visual-only PR.

## Implemented opportunity matrix

| Existing problem | Reference principle | Visual solution / screen | Benefit | Status | Approval required |
|---|---|---|---|---|---|
| Mark-all-read clips beyond a 320px viewport | Touch target / responsive affordance, transcript 19 and W3C | Wrap Notifications header; 44px existing control | The action fits and remains reachable | Implemented and captured | No |
| Notification text is tiny and each update has another outlined box | UI hierarchy / familiar patterns, 1, 12–13 | Readable rows, restrained unread edge, 16px title / 14px body | Easier scanning of real updates | Implemented | No |
| Booking active/past choices compete with content as separate pills | Choice hierarchy, 14 | Quiet tab underline, same filters/order/selection logic | Selection is clear without extra chrome | Implemented | No |
| Booking business/date/price hierarchy is weak | UI clarity / feedback, 1, 11 | Bricolage screen title; Inter 17px business, 14px date, tabular amount | Easier comparison of actual jobs | Implemented | No |
| Orders use small heading and tight status/amount layout | Status clarity, 11 | Responsive status row, 28px tabular amount, 44px back target | Pending/paid information stays readable | Implemented | No |
| Business identity sits in a large enclosing card | Content-first visual brief / 1 | Open identity layout; refined service type/spacing | Business and service content are easier to read | Implemented | No |
| Utility loading shows a detached spinner | Structural loading, 2–3 | Shared static `ContentSkeleton`, labelled busy state | Shows the kind of content being loaded | Implemented for profile/bookings/orders/notifications | No |
| Empty states use oversized enclosing cards | Empty state clarity, 8 | Canvas composition and stronger existing headline/copy | Clearer explanation with the same actions | Implemented | No |
| Shared errors squeeze retry beside narrow text | Error placement, 7 | Readable message with existing retry below; compact semantic edge | Better recovery affordance on narrow screens | Implemented; Search failure/retry regression passes | No |
| Focus treatment is inconsistent across light/dark web controls | Button states, 17 / W3C focus | Theme-aware CSS focus outline and forced-colors support | Keyboard position stays visible | Implemented | No |
| New-owner Today setup uses heavy border/box styling | Functional hierarchy, 14 | Refined setup surface, heading/body rhythm; same verification action | Clearer next existing step | Implemented with inert owner fixture | No |
| Business navigation clips enlarged text in WebKit | Text resizing / target usability | Allow the existing bar to grow with wrapped labels, without changing destinations or ordering | Keeps every tab readable at 200% web text | Implemented after visual QA caught vertical clipping | No |
| Older app surfaces differ in polish | Consistency / familiar patterns | Preserve already shipped Home, Search, Chat and type system; regression check shared changes | Avoids replacing stable work for novelty | Verified within listed browser coverage | No |

## Design system decisions

- **Typography:** retain the six existing static faces. Bricolage 600 is used for selected 28px screen / 22px empty headings; Inter 400/500/600 for body, labels and controls. Functional text generally 14–17px with 20–23px line heights. Prices use tabular numerals. No new font or synthetic face.
- **Color:** existing warm ivory `#F7F5F0`, charcoal `#121411`, beige fill `#D0BFA6`, bronze foreground `#805D2E`, and matching dark tokens remain authoritative. Existing AA palette tests remain unchanged. Semantic status is not inferred or recolored into false success.
- **Surfaces:** a real booking/order/service can have a quiet 12px surface. Identity and empty-state content sit on the canvas. Notifications use a divider and a meaningful unread edge, not repeated enclosing cards. Existing theme selection/persistence is untouched.
- **Spacing:** 20px screen gutters; 12–18px item spacing; 44px minimum utility targets where refined. Wrapping replaces rigid heights in affected controls. Existing safe-area/navigation integration remains in place.
- **Motion:** no added animation library, loop, blur, per-frame state update, gesture threshold or artificial loading delay. Existing MotionPressable/Reanimated/reduced-motion behavior remains. Static skeletons have no invented progress values.
- **Accessibility:** content skeletons expose one labelled busy state, decorative pieces retain hidden accessibility props, shared errors retain alert semantics. Focus uses theme text color and forced-colors `Highlight`. Enlarged web text is tested separately from unverified native Dynamic Type.

Notifications geometry at 320px: before, the existing mark-all-read control extended to **351px** and was **38px high**; after, it ends at **144px** and is **44px high**. Captures show the difference. This is a layout measurement, not a speed benchmark.

## Functional parity

A TypeScript AST comparison against baseline checked **63 action/disabled expressions**, named async data/action functions, and `useEffect`/`useCallback` bodies across the five screen files. They are unchanged. Existing route destinations, request parameters, backend reads, mutations, filtering, disabled conditions and subscription/checkout actions are retained. The profile’s full description, following, save, website, highlights, services, products, packages, memberships and posts remain rendered under the same conditions.

This source comparison supplements browser interaction tests; it is not proof of real authentication, permissions or payment completion.

## Research and evidence

See [source analysis](synsation-visual-research.md): 19 inspected secondary transcripts plus four primary accessibility/performance explanations. Instagram/TikTok/YouTube demonstrations unavailable in this environment are explicitly distinguished from text actually read. No claim of having watched those videos is made.

Before/after evidence is retained in `docs/experience-v2-evidence/synsation/`. Captures use the real rendered Expo application with **labelled, inert transport fixtures**. They never write a real order, booking, notification or payment. Baseline comes from an isolated export of the exact production commit above; after comes from this branch. No generated mockups are substituted for captures.

A real anonymous production Home read returned **zero businesses**. Therefore a real populated public business profile could not be validated from discovery; fixture profile coverage is not represented as production data coverage.

## Quality record

- `npm run typecheck`: passed.
- `npm run lint`: zero errors, 12 pre-existing warnings.
- `npm run audit`: passed; 664 source/config files, 96 routes at first run.
- `npm run audit:migrations`: passed; 235 migrations.
- `node --test tests/*.test.mjs`: 413 passed, zero failed.
- `npm run test:navigation`: 20 passed.
- `npm run build:web`: passed.
- Chromium and WebKit: 60 rendered layouts each across five edited screens, 320/375/390/430/768/1440 widths, light/dark; controlled loading, error/retry, empty and existing booking filters.
- Existing Home/Search: 42 mode/theme/width combinations each, including reduced motion, navigation and Search recovery. Typography: 24 representative six-screen combinations and font fallback. Final CI and hosted-preview results are recorded in the draft PR.
- `npm ci` and Expo Doctor are configured in the PR CI workflow; local dependency lockfile was unchanged. Native build/config/tooling is unchanged by this branch.

**NOT VERIFIED:** physical iOS/Android, native Dynamic Type, Dynamic Island/edge-to-edge behavior on hardware, VoiceOver/TalkBack, real virtual keyboards, real authenticated customer/provider/employee flows, payment/booking completion or country isolation. Browser fixtures only establish UI behavior under controlled responses.

No startup-speed, network reduction, conversion improvement, native FPS or 120Hz claim is made for this visual PR. Static skeletons improve presentation while keeping the original timing/data flow; initial JS execution remains an earlier measured limitation.

## REQUIRES OWNER APPROVAL — excluded proposals

1. Change profile **View services** from global Search to an in-profile section. Its current destination remains unchanged.
2. Persist a selected service through the sign-in flow. Existing authentication/return-route behavior remains unchanged here.
3. Split profile data loading into independently retryable sections or skip private guest lookups. Even though this is valuable and section-loading presentation is allowed, changing fetch/recovery behavior is conservatively held for explicit review.
4. Collapse long descriptions behind a new disclosure. Full current descriptions remain visible.
5. Change disabled-submit policy, validation timing, required fields, input normalization, or request/checkout steps.
6. Change primary tab order, assistant visibility, gesture thresholds, cart placement/destinations or social feed behavior.
7. Bound Business Today queries or alter job prioritization. Requires permission-aware operational testing.
8. Integrate #97, deploy migrations/functions, change RLS/auth/payment systems, or enable India payments. These remain separate backend/transaction readiness work.

## Remaining sequence

Review this bounded visual PR first. Next visual-only passes can cover request/Live forms, Shop/product/cart, account/auth/settings and verified Business Today/CRM with suitable inert fixtures and, preferably, approved staging accounts. Existing 96-route inventory remains in `experience-v2-screen-inventory.md`; this milestone does not claim every major surface has been fully transformed or device-tested. The modern chat redesign is retained and receives shared-style regression coverage rather than an unnecessary rebuild.
