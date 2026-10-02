# Mobile presentation refinement

Base: `a36563c` on `main`. Branch: `design/premium-mobile-refinement`.

## Scope and audit

This is an incremental presentation pass, not a replacement of the existing product. The existing Expo 54 / React Native 0.81.5 / React 19.1 / Expo Router 6 stack already includes Reanimated 4.1, Gesture Handler 2.28 and Expo Haptics. No dependencies were added or upgraded.

The audit found a usable warm-neutral palette and experience tokens, an existing UI-thread customer pager, product gallery gestures, and extensive messaging interaction work. These were retained. The changes target inconsistent feedback, incomplete reduced-motion behavior, small controls, narrow layouts, and safe-area spacing. Navigation clarity, restrained motion, readable hierarchy and contextual actions are the reference principles; no third-party visual assets or layouts were copied.

## Implemented phases

1. **Shared system and navigation:** warm charcoal dark surfaces, 16px body tokens, existing Everest/Pulse/Classic modes retained; cards and buttons consume appearance tokens; selected navigation icons use the higher-contrast accent. Native accessibility states are also explicitly forwarded as ARIA attributes for React Native Web, including checked and selected state. One shared OS reduced-motion subscription replaces per-component subscriptions, and Classic suppresses motion. Reanimated press feedback is interruptible and resolves callback styles before passing them to the animated component. Existing haptics are reused. iOS detail navigation uses the native default transition; reduced motion disables root transitions.
2. **Home and profiles:** customer actions keep their styling during presses; the Everest Live action no longer truncates on narrow phones. Section links have larger targets. Business Home has structured loading placeholders, a retry action, bottom safe-area spacing, a stronger daily-work metric, readable queue titles and wrapping weekly metrics. Jobs remain primary; CRM remains available below them. Profile controls, small link contrast and modal accessibility were refined. The floating Ask Everest control now clamps its position after viewport changes, preventing desktop-to-phone overflow, and respects reduced motion.
3. **Discovery, messaging and commerce:** discovery comments and messaging/profile menus respect reduced motion. Messaging menus use actual bottom insets; reply cancellation is labelled and 44px. Shop has a back action, wrapping header, 16px search input, keyboard tap handling, announced filter state, 44px filter controls and a more resilient product grid. Bookings reserve space for the navigation and home indicator, improve status readability and no longer present an empty success state alongside an initial load failure. Existing gallery, live matching and messaging logic remains intact.
4. **Operational surfaces:** shared operational tabs, team/member controls and icon buttons have larger targets; input labels are exposed to assistive technology; job titles and status shapes are refined. The CRM new-deal sheet now scrolls within a keyboard-avoiding container, accounts for bottom insets, labels its fields and uses 16px inputs.
5. **Verification:** the rendered browser checker covers Home across three widths, all appearance modes and both color themes, plus Shop layout, menu dismissal and filter state. Existing regression suites are also run.

## Changed files

- `lib/theme.tsx`, `lib/experience.tsx`, `lib/motion.ts`
- `components/ui/MotionPressable.tsx`, `AppButton.tsx`, `AppCard.tsx`
- `components/CustomerTabBar.tsx`, `BusinessTabBar.tsx`, `DraggableAskEverest.tsx`
- `components/BusinessOperationsPrimitives.tsx`, `BusinessOperationsStyles.ts`
- `app/_layout.tsx`, `app/+html.tsx`, `public/index.html`
- `app/index.tsx`, `business-today.tsx`, `account.tsx`, `business-profile.tsx`
- `app/shop.tsx`, `bookings.tsx`, `messages.tsx`, `social.tsx`, `business-crm.tsx`
- `scripts/verify-mobile-presentation.mjs`

## Verification and release limits

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with 12 existing warnings; baseline has 13 |
| `node --experimental-strip-types --test tests/*.test.mjs` | 407 passed / 1 failed; identical failure on untouched main |
| `npm run build:web` | Passed, including HTML shell and export verification |
| `npx expo export --platform all --max-workers 2` | Passed for web, iOS and Android bundles; not native app compilation |
| `node scripts/verify-mobile-presentation.mjs` | All 23 rendered checks passed in Chromium |
| `npm run audit` | Passed: 644 source/config files and 96 routes |
| `npm run audit:migrations` | Passed: 235 migrations inspected |
| `NODE_USE_ENV_PROXY=1 npx --yes expo-doctor` | 18/18 passed; initial invocation could not reach metadata APIs without Node proxy support |
| `git diff --check` | Passed |

The full regression suite has one independently reproduced baseline failure: `OAuth uses authenticated membership for initiation and signed expiring callback state` in `tests/crm-integrations-automation.test.mjs`. The assertion expects an older direct business-membership query; the existing OAuth function uses permission RPCs. Untouched `main` produces the same 407 passed / 1 failed result. This pass does not change OAuth authorization or weaken the test.

Baseline lint reports 13 hook-dependency warnings. This branch reports 12 warnings and no errors; the floating-control callback dependency warning was resolved.

Browser verification uses Linux Chromium at 320, 390 and 1280 CSS pixels. This is not native iOS, Android device, or iPhone Safari verification. No native 60 FPS measurement, keyboard/device safe-area test, or haptic hardware test was available. Authenticated customer/business journeys require test accounts; they have source/regression coverage but were not exercised end to end here. Public Shop requests currently show their retry state, and some public community media fails to load. These backend/media conditions limit populated-gallery and shopping visual coverage.

Production deployment remains gated on resolving the baseline test failure and completing authenticated and physical-device acceptance checks. No database, migration, authentication, dispatch, payment, verification or API contract changes are included. The repository's existing postinstall script creates local migration alias symlinks for validation; they are excluded locally and are not part of the PR.

## Reproduce the rendered checks

Start the web app with `npm run web -- --port 8082`, then run:

```sh
node scripts/verify-mobile-presentation.mjs
```

The script uses pinned `agent-browser@0.38.1`. Override `EVEREST_PREVIEW_URL` and `EVEREST_BROWSER_PATH` when needed. It changes only local browser preferences and a read-only Shop filter, not account or marketplace records.
