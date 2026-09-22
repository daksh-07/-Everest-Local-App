# Everest Local private-beta UX review — 22 September 2026

## Scope and evidence boundary

This phase started from local commit `48103a1a5477ade9a95018c19f3ce72f60f2baf2` on `fix/private-beta-20260922`. No push or deployment was performed.

- **Observed in production:** unauthenticated Home and Explore at `https://everest-local-app.vercel.app/`, in a desktop Chrome cloud browser (1363 × 936-class viewport).
- **Verified in source/build:** the changes in this phase, TypeScript, ESLint, tests, static audit, Expo Doctor and Expo web export.
- **Not visually verified after the changes:** the local preview could not be reached from the cloud browser because localhost access was blocked.
- **Not verified:** real iPhone Safari, authenticated customer/business/driver journeys, checkout payment, admin MFA re-login, or a deployed build containing these changes.

## 1. First-impression assessment

The production Home used a coherent black, warm-white and beige palette, but it communicated a collection of functions more strongly than a clear local-marketplace proposition. “What do you need?” did not explain what Everest Local was, Sydney appeared as a fixed location without a service-area caveat, and Ask Everest appeared both as a content card and a floating global control. At desktop width, content and bottom navigation stretched across the viewport rather than feeling intentionally composed.

Production Explore was a more serious trust problem. It was initially observed in an error state and later rendered five separate empty panels (businesses, services, products, posts and jobs). Both states psychologically communicated that the marketplace was empty or broken. The search field also took focus immediately, an undesirable first-open behavior on mobile because it can summon the keyboard before the user understands the screen.

## 2. Major UX problems found and disposition

| Priority | Screen / task | Evidence | User impact | Disposition / acceptance test |
|---|---|---|---|---|
| P0 | Explore public discovery | Source embedded private `inventory` in an anonymous product query; deployed Explore was observed failing/empty. Live Supabase privilege inspection confirmed anonymous `products` access but no anonymous `inventory` access. | A core first-use surface could fail because an optional/private relation was requested. | Removed the inventory embed from public Explore and Product detail. TypeScript, regression tests and web export pass; post-change deployed runtime remains unverified. |
| P1 | First 30 seconds on Home | Observed heading did not state the product proposition; actions read as a function menu. | A new customer had to infer what Everest Local was. | Added a compact value proposition, clearer search promise, three intent-led starting actions and truthful area availability copy. |
| P1 | Low-supply Explore state | Observed five empty panels simultaneously. | Legitimate low supply looked like product failure. | Aggregate view now shows only real sections with results, keeps useful service taxonomy, and provides request/join actions without fabricated supply. |
| P1 | Customer navigation | Home had a bespoke bottom bar while key customer destinations lacked the same persistent model. | Users could not reliably predict how to return or switch tasks. | Added one safe-area-aware customer tab bar to Home, Explore, Activity, Messages and Account. |
| P1 | Authentication hierarchy | Source placed three large role cards before the sign-in proposition/form. | Returning users could see role setup before the task they came to complete. | Sign-in now uses compact customer/business/driver intent tabs; full explanatory cards remain on account creation. |
| P1 | Mobile form behavior | Several customer inputs used 13–15px text. | iPhone Safari may zoom on focus and destabilise layout. | Search, auth, request, cart address and message composer inputs now use 16px text. |
| P1 | PWA prompt timing | Source could show install instructions during the first visit. | An install request competed with product comprehension. | Prompt is deferred until the second visit and five seconds of dwell time. |
| P2 | Perceived performance | Explore, Activity and Messages used generic spinners. | Data loading felt less structured and caused uncertain layout. | Added stable, non-transactional skeleton rows; server-confirmed transaction semantics remain unchanged. |

## 3. Changes implemented

- `app/index.tsx`: rebuilt the first screen’s hierarchy around proposition, search, area context, service/product/request intents, service categories and activity.
- `app/search.tsx`: repaired the anonymous discovery query; isolated optional Posts/Jobs fetching; added truthful low-supply, loading, error and tab-specific empty states; clarified price, quote and stock language; removed automatic input focus.
- `app/product.tsx`: removed the private inventory dependency and replaced unsupported stock claims with “Stock confirmed at checkout”; unauthenticated add/save actions now lead to sign-in.
- `app/auth.tsx` and `components/AuthRolePicker.tsx`: moved the proposition before role choice, introduced compact returning-user role tabs, respected reduced motion and corrected mobile input sizing.
- `app/activity.tsx`, `app/messages.tsx`, `app/account.tsx`: added consistent navigation and useful signed-out/empty/error paths.
- `components/CustomerTabBar.tsx`: introduced a reusable, safe-area-aware five-destination navigation primitive.
- `components/LoadingList.tsx`: introduced a consistent accessible loading skeleton.
- `components/PwaInstallPrompt.tsx`: deferred the install prompt beyond the first visit.
- `app/request.tsx`, `app/cart.tsx`: corrected key form input sizing for iPhone Safari.
- `app/_layout.tsx`: suppressed the global Ask Everest control where the screen already provides that destination or where it would compete with primary tasks.
- `lib/ui.ts`: added a small shared set of existing-brand colours, radii and content width rather than a replacement design system.
- `tests/customer-experience.test.mjs`: added regression guards for public inventory isolation, shared navigation and first-use/mobile accessibility behavior.

No database, dispatch, authentication authority, MFA, RLS, verification or payment lifecycle logic was changed.

## 4. Design-system changes

- Preserved the existing premium black, warm-white and beige direction.
- Standardised core canvas, surface, ink, muted, line, success and danger colours.
- Standardised common 12/16/20px radii and a 760px customer-content maximum width.
- Kept controls at or above 44px on the new/changed interactive surfaces.
- Used hierarchy, spacing and borders instead of adding gradients, glass effects or decorative animation.
- Added press feedback and selected-state semantics to new navigation and tab controls.
- Kept animation limited to the existing auth entrance and made it respect reduced-motion preference.

## 5. Customer journey improvements

The first customer decision is now explicit: find a service, shop local, or request quotes. Search describes what it covers. Service-category cards preserve their intended filter instead of routing to an undifferentiated result view. Explore loads the core public marketplace independently of account-only and social data, shows real results only, and turns low supply into a useful request path. Product availability language no longer implies that private inventory was successfully read. Activity, messages and account remain reachable through a predictable navigation model.

## 6. Mobile experience

Implemented source-level improvements include bottom-safe-area spacing, 44px+ touch targets, 16px form inputs, no Explore autofocus, delayed PWA interruption, reduced-motion handling, constrained content width, bottom padding clear of fixed navigation, and no new horizontal fixed-width layout.

These are **not equivalent to real iPhone Safari validation**. Keyboard overlap, dynamic viewport behavior, actual safe-area rendering, input zoom, sticky controls and 390px horizontal overflow still require a physical/device-browser pass against the deployed candidate.

## 7. Empty, loading and error states

- Explore: structured skeleton, retryable failure state, contextual tab empties and a productive honest low-supply state.
- Activity: structured skeleton; signed-out/empty state offers Explore and Request actions.
- Messages: structured skeleton; empty state explains when conversations appear and links to Explore.
- Product: truthful stock confirmation timing and recoverable add/save authentication path.
- PWA: no first-visit install interruption.

No fake businesses, ratings, reviews, products, requests, jobs, orders or marketplace statistics were introduced.

## 8. Validation

All local checks below were run in `/workspace/scratch/c15ac09aba19/everest-local` on branch `fix/private-beta-20260922`, with this phase’s working tree applied on top of `48103a1a5477ade9a95018c19f3ce72f60f2baf2`.

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | PASS |
| ESLint (`npm run lint`) | PASS |
| Complete regression (`npm test`) | PASS — 116/116, including 3 new UX regression guards and both driver suites |
| Static audit (`npm run audit`) | PASS — 233 source/config files, 39 routes |
| Migration audit (`npm run audit:migrations`) | PASS — 123 migrations |
| Expo Doctor (`npx expo-doctor`) | PASS — 18/18 |
| Web export (`npm run build:web`) | PASS — bundle and build provenance verified |
| Local web server | STARTED successfully on port 8081 |
| Post-change browser render | BLOCKED — cloud browser could not reach workspace localhost |
| Production desktop Home/Explore | INSPECTED — production remains the older deployed state |
| Real iPhone Safari | NOT RUN |

The new `customer-experience` tests are source-invariant regression guards. They do not, by themselves, prove browser runtime correctness.

## 9. Screen-by-screen remaining issues

| Screen / journey | Remaining status |
|---|---|
| Home | New source hierarchy is compile/export validated but not post-change visually inspected. Area is still Sydney-wide rather than a user-selected suburb. |
| Explore | Critical query dependency is repaired in source. Runtime against a deployed candidate and real low/high-supply datasets is pending. |
| Authentication | New hierarchy is source/build validated. OAuth, password, keyboard and session recovery were not completed in a browser. |
| Service request | Input zoom safeguard added; full create/confirmation journey remains unexecuted in this phase. |
| Quote / booking | No redesign in this phase; authenticated state progression remains unverified. |
| Product / cart / checkout | Discovery wording improved; Stripe test Checkout and authoritative return journey remain unverified. |
| Orders / delivery tracking | Not materially changed; authenticated state and mobile presentation remain unverified. |
| Messages | Empty/list source improved; live conversation, composer keyboard behavior and retry path remain unverified. |
| Account | Shared navigation added; authenticated role switching remains unverified. |
| Business profile/onboarding/dashboard | Source reviewed only at a high level; no authenticated browser journey in this phase. |
| Driver | No workflow changes; authenticated mobile journey remains unverified. |
| Admin MFA | No workflow changes; logout/TOTP/login repeat verification remains unverified. |
| Desktop responsiveness | Production inspected; new max-width composition not rendered in the accessible browser. |
| iPhone Safari | UNVERIFIED. |

## 10. Private-beta UX verdict

**VALIDATED WITH SPECIFIED LIMITATIONS — source/build readiness only.**

The source now has a materially clearer first impression, a repaired public Explore dependency, more honest low-supply behavior, consistent customer navigation and better mobile/accessibility safeguards. It is not a validated deployed release. The branch is still local, CI has not run on the final commit, production is unchanged, and the candidate has not completed real iPhone Safari or authenticated/payment journeys.
