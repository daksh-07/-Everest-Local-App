# Design system specification

The system lives in code, not in this document. This page says where each decision is made and what the rules are; when they disagree, the code wins and this page should be updated.

## Sources of truth

| Concern | File | Notes |
|---|---|---|
| Colour | `lib/theme-colors.ts` | Light: warm ivory canvas `#F7F5F0`, charcoal text `#121411`, champagne brand fill `#D0BFA6`, readable accent `#805D2E`. Dark: true black canvas `#000000`, neutral grey surfaces `#101010` / `#1B1B1B`, no brown tints. Contrast protected by `tests/palette-contrast.test.mjs`. |
| Spacing, radius, controls, layout | `uiTokens` in `lib/theme.tsx` | Space 4·8·12·16·20·24·32·40; radius 10·14·20·24; controls 44/48/52; `layout.contentMaxWidth` 1180. |
| Experience modes | `lib/experience.tsx` | DEFAULT / PULSE / CLASSIC adjust type size, density, radius and motion. CLASSIC is the high-clarity mode (larger targets, no motion). |
| Typography | `lib/typography.ts`, `components/ui/AppText.tsx` | Bricolage Grotesque only for `hero`, `title`, `section`; Inter for everything else. Weights ≥700 map to a real Bold face, never synthetic. |
| Motion | `lib/motion.ts` | 150 ms fast / 210 ms standard, one easing curve, shared reduced-motion subscription. CLASSIC implies reduced motion. |
| Formatting | `lib/format.ts` *(new)* | `formatDay`, `formatTime`, `formatSchedule`, `formatMoney`, `formatStatus`. en-AU default; pass locale/currency for other markets. |
| Floating layers | `lib/floating-layers.ts` *(new)* | Bottom overlays register their height so others stay clear. |

The legacy `lib/ui.ts` palette (green brand, unrelated greys) was removed; its only remaining use was a max-width constant.

## Type scale (in use)

| Role | Size / line | Weight | Use |
|---|---|---|---|
| hero | 28/34 mobile, 36/42 desktop | display 700 | One per screen, Home greeting |
| title | 28–30/34–36 | display 600 | Screen title (Activity, Today, Profile, Shop) |
| section | 20/26 (17/22 inside dense work screens) | display 600 / Inter 600 | Section headings via `SectionHeader` |
| body | 15–16/21–24 | 400–500 | Row titles 15/20 600 |
| supporting | 13–14/18–20 | 400 | Captions, metadata |
| metadata | 12/16 | 500 | Dates, count labels — the floor. Nothing below 11px; 11px only in badges |

## Rules

1. **Sentence case.** No uppercase eyebrows or uppercase buttons. Status enums go through `formatStatus` (`PENDING_PAYMENT` → "Pending payment").
2. **Cards for objects only.** A booking, business, product or post may be a surface. Headings, counts and navigation are not wrapped in cards. Groups of rows use one inset surface with hairline dividers (Activity, Business Today).
3. **One section header.** `components/ui/SectionHeader` — title, optional caption, up to two text actions with 44px targets.
4. **Counts in one strip.** Several small numbers share a single divided surface (Activity counts, Business Today glance) rather than separate tiles.
5. **Hairline borders.** `StyleSheet.hairlineWidth` on surfaces; 1px+ borders only for focus or selected states.
6. **Touch targets ≥44px.** Text links get `minHeight:44`; icon buttons are 44×44 even when the glyph is 20–22px.
7. **Honest data.** Never render a placeholder that looks like data (`--°`, "0 nearby" when unknown). Omit until real.
8. **Status colour.** Green is reserved for live / confirmed / positive; accent (champagne-brown) for waiting-on-you; red for problems. `StatusBadge` pairs colour with a text label and dot, never colour alone.
9. **Floating UI.** Bottom overlays must call `useRegisterFloatingLayer`; anything else floating must read `useFloatingLayerOffset`.

## Components

Shared primitives in `components/ui`: `AppText`, `AppButton`, `AppCard`, `AppTextInput`, `MotionPressable`, `StatusBadge`, `EmptyState`, `ErrorBanner`, `LoadingState`, `Skeleton`, `ContentSkeleton`, `SectionHeader` (new). No new dependencies were added.

## Known gaps

- ~40 secondary screens still use local style objects with `fontWeight:'900'` and uppercase micro-labels. Migrate them to `SectionHeader` and the type scale as they are touched.
- No shared list-row component yet; Activity and Business Today implement the same inset-grouped row locally. Extract once a third screen needs it.
