# Visual regression report

## How captured

- Build: `npm run build:web` (production-style export), served with `serve -s`.
- Script: `scripts/capture-design-evidence.mjs`. Chromium (Playwright 1.56), reduced motion, `en-AU`, `Australia/Melbourne`. Every Supabase request is answered by an inert fixture; writes return 403. Weather and geocoding are blocked, so weather is intentionally absent.
- Matrix: Home (signed in), Home (guest), Search, Shop, Activity, Account, Business Today × Light/Dark × 320×568, 390×844, 412×915, 1280×800 = 56 captures per build.
- Machine-readable results: `evidence/before-report.json`, `evidence/after-report.json`.

**Result:** 56/56 after-captures with no horizontal overflow and no page errors (same as before).

These are browser renderings of React Native Web. They are not iOS or Android screenshots and no physical device was used.

## Before / after

| Screen | Before | After | What changed |
|---|---|---|---|
| Home, light 390 | `evidence/before/home-light-390x844.png` | `evidence/after/home-light-390x844.png` | Compact header (no brand eyebrow, no menu), working Ask in search, readable date, sentence-case continue label |
| Home, dark 390 | `before/home-dark-390x844.png` | `after/home-dark-390x844.png` | Same, on true-black canvas |
| Home, scrolled | `before/home-scrolled-light-390x844.png` | `after/home-scrolled-light-390x844.png` | Monogram fallbacks, image-led product cards, consistent section headers |
| Home guest, 320 | `before/home-guest-dark-320x568.png` | `after/home-guest-dark-320x568.png` | Intents stack instead of truncating; tab labels fit; person icon instead of "EL" |
| Home, desktop | `before/home-light-1280x800.png` | `after/home-light-1280x800.png` | Mini player centred over tab bar |
| Activity, dark 390 | `before/activity-dark-390x844.png` | `after/activity-dark-390x844.png` | Decision items visible at first paint; status badges; Ask button no longer covers the mini player |
| Business Today, light 390 | `before/business-today-light-390x844.png` | `after/business-today-light-390x844.png` | Date header, compact setup notice, count strip, *Needs attention* above CRM |
| Shop, light 390 | `before/shop-light-390x844.png` | `after/shop-light-390x844.png` | No orphaned "All" chip; single filter row |
| Account, light/dark 390 | `before/account-*-390x844.png` | `after/account-*-390x844.png` | Identity header beside avatar; no uppercase eyebrows |

## Self-review notes (issues found while inspecting and fixed before commit)

1. First Home pass wrapped "Discover businesses" onto two lines beside two actions → shorter title and caption moved below the row.
2. Section-header actions sat above the title baseline → row centres; caption is separate.
3. 320px intents truncated → stack.
4. Post type fell back to "Pending" when absent → "Post".
5. Desktop mini player was left-aligned (pre-existing) → centred.

## Still visible in the after set

- Business Today: the draggable Ask Everest button can sit over the "Open CRM" link (audit B1).
- Product images are fixtures without photos, so image-led layouts are shown with fallbacks.
