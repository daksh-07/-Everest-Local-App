# Colour identity: Everest Electric

Status: implemented on `design/everest-transformation-2026-10` (PR #104). Source of truth: `scripts/palette-candidates.mjs` → generated `lib/theme-colors.ts`. Verified by `tests/palette-contrast.test.mjs`.

## 1. Decision

**Everest Electric** is the shipped palette. **Everest Blue** (`#315BEE`) marks primary actions, selected navigation and links. **Fresh Teal** (`#087E78`) is the Everest Live identity. **Warm Coral** (`#F36B52`) is a sparing discovery accent, used only for promoted badges and similar highlights. Neutral, slightly cool canvases (`#F8FAFC`; true black in dark mode) let photography and user content carry richness.

### Directions compared
All three were built from the *same component code* and the *same fixture content*. They were captured on Home, Search, Everest Live, Shop, Business Today, Jobs, Social and Product, in light and dark. Sheets: `evidence/colour/candidates-A-light.png`, `-A-dark`, `-B-light`, `-B-dark`; columns are beige (old) · Electric · Alpine · Sunrise.

| Direction | Primary | What the screens showed | Verdict |
|---|---|---|---|
| Everest Electric | Blue `#315BEE` / dark `#88A5FF` | Clearest action hierarchy in both modes. Blue never collides with status colours, which leaves teal free to identify Live. | **Chosen** |
| Alpine Teal | Teal `#0B6F6B` | Calm and distinctive. But teal primary actions sit next to green "Available now"/"Confirmed" states, so actions and success blur together. | Rejected |
| Sunrise Coral | Coral-red `#CC3A22` | Energetic and warm. But "Live search active", "Low stock" and the primary button all read as errors, and it sits close to Airbnb. | Rejected |

Known weakness of the choice: blue is common among competitors (Uber's accent `#276EF1`, Airtasker, Thumbtack `#009FD9`). Distinctiveness therefore comes from three things rather than from the hue alone:
- the teal Live identity and its dark radar map;
- the tinted category tiles;
- restraint: one dominant hue, neutral surfaces.

### Colour distribution (how the app stays alive without being loud)
- **Blue:**
  - primary buttons (Request quotes, Book, Add to cart, Sign in);
  - the selected tab icon and label;
  - selected filter chips (Search, Jobs);
  - links ("See all", "Open job");
  - verified ticks;
  - category tiles: one shared `primaryContainer` tint, not one colour per category.
- **Teal:** everything Everest Live (Home "Need it now?" entry, the mini player, the Live screen status, the map radius and your-location marker, the ambient edge).
- **Coral:** "Promoted" badges (social feed, profile) on `tertiaryContainer`. Never used for errors and never used as text on white (2.98:1 fails).
- **Gold (`rating`):** star ratings only.
- **Status** (success, warning, danger, info): truthful backend states only, always with text or an icon. Low stock and Live reconnecting are now *warning*, not brand. "Available now" and automation "On" are *success*.
- **Neutrals:** every surface, so photos and posts carry the rest of the colour.

Avoided on purpose: rainbow navigation, per-card colours, gradients, glows and neon purple.

## 2. Research references
Verified by fetching primary sources where possible. Where a hex value is only approximate, it is marked as such.

- Apple HIG, Color (https://developer.apple.com/design/human-interface-guidelines/color):
  - "Avoid using the same color to mean different things".
  - Provide light, dark and increased-contrast variants.
  - "Avoid relying solely on color".
  - Apply colour sparingly; brand colour as the accent in mostly monochrome UIs.
- Material 3 colour roles, via material-components-android `docs/theming/Color.md` and developer.android.com (m3.material.io is JS-only):
  - primary/on-primary/primary-container/on-primary-container (light tones 40/100/90/10, dark 80/20/30/90);
  - secondary for less prominent components, tertiary for contrasting accents;
  - surface container levels;
  - HCT tonal palettes (material-color-utilities).
- WCAG 2.2 (https://www.w3.org/TR/WCAG22/):
  - 1.4.1 Use of Color (A);
  - 1.4.3 Contrast Minimum 4.5:1, or 3:1 for large text (18pt or 14pt bold);
  - 1.4.11 Non-text Contrast 3:1, including UI states;
  - 2.4.11 Focus Not Obscured (AA);
  - 2.4.13 Focus Appearance (AAA).
- Competitors:
  - Uber Base tokens (black/white, accent `#276EF1`; github.com/uber/baseweb);
  - Thumbtack Thumbprint `#009FD9` ("color should be used sparingly to drive focus");
  - Swiggy brandbook `#FF5200`;
  - Urban Company (black/white by choice);
  - Airtasker (bold electric blue, no hex published);
  - Spotify (green only on black/white);
  - approximate values from public UI: Airbnb `#FF385C`, Shop ~`#5433EB`, Etsy ~`#F1641E`, Revolut ~`#494FDF`.
  - Pattern: one dominant hue for actions and selection, neutral content surfaces, photography for richness, and semantic colours separate from brand.
- Colour and UX research:
  - Kurosu & Kashimura 1995 and NN/g, the aesthetic-usability effect (it forgives minor issues, not major ones);
  - Stanford/Consumer WebWatch credibility study ("design look" was mentioned in 46.1% of comments; this does not isolate colour);
  - Hurlbert & Ling 2007 (doi:10.1016/j.cub.2007.06.022) and Palmer & Schloss 2010 (PNAS): a broad preference for blue, with saturated colours preferred over muted ones;
  - Labrecque & Milne: blue associated with competence;
  - Jonauskaite et al. 2020: cross-cultural colour–emotion similarity r = .88;
  - Elliot 2015: colour effects are context-dependent and often underpowered.
  - **No credible evidence was found that blue (or any colour) generally increases conversion or retention. This document makes no such claim.**
- Australia and India:
  - The Indian tricolour symbolism (BIS) means saffron has religious and political connotations, so the saffron + white + green combination is avoided.
  - Red is widely auspicious and white is associated with mourning in many Hindu communities (varies by community; non-peer-reviewed sources).
  - Australia's national green and gold are tied to sport, with no strong distinct hue meanings beyond Western norms.
  - Electric uses none of these combinations, and status colours always carry text or icons, as Apple recommends for cultural variation.
- Colour-vision deficiency:
  - About 8% of men of Northern European descent have red-green deficiency (Birch 2012; NEI "about 1 in 12 men"). Indian school studies range from about 0.6% to 7.5%.
  - A Machado simulation showed success-green vs error-red ΔE dropping from about 100 to about 20 under deutan/protan, and coral vs red dropping to about 15.
  - Hence: status is never colour-only, coral is never an error colour, and blue and teal stay well separated (ΔE about 74).

## 3. Tokens (`lib/theme-colors.ts`, 44 roles)
The legacy keys (`brand`, `onBrand`, `accent`, `accentSoft`) map onto the new roles. Existing components therefore recolour without logic changes, while new code uses the semantic names.

| Role | Light | Dark |
|---|---|---|
| `canvas` | `#F8FAFC` | `#000000` |
| `surface` | `#FFFFFF` | `#111111` |
| `elevated` | `#F1F4F9` | `#1F1F1F` |
| `soft` | `#EDF1F7` | `#262626` |
| `input` | `#FFFFFF` | `#161616` |
| `navigation` | `#FFFFFF` | `#0C0C0C` |
| `text` | `#161A24` | `#F3F5F9` |
| `textSecondary` | `#4F5869` | `#C5CAD3` |
| `muted` | `#5B6476` | `#A6ACB8` |
| `border` | `#E1E6EE` | `#2E2E2E` |
| `borderStrong` | `#7A8498` | `#7C7C7C` |
| `overlay` | `rgba(14,18,30,.52)` | `rgba(0,0,0,.76)` |
| `disabled` | `#E3E7EE` | `#2A2A2A` |
| `onDisabled` | `#5F6778` | `#9A9FA9` |
| `rating` | `#A86500` | `#F3C455` |
| `success` | `#13773A` | `#72D08F` |
| `successContainer` | `#E2F4E7` | `#0E2B18` |
| `warning` | `#8A5700` | `#F3C455` |
| `warningContainer` | `#FFF2D3` | `#30250A` |
| `danger` | `#C0262D` | `#FF8C85` |
| `dangerContainer` | `#FDE7E7` | `#3A1312` |
| `info` | `#0B67A3` | `#7EC6F4` |
| `infoContainer` | `#E1F0FA` | `#0D283A` |
| `primary` | `#315BEE` | `#88A5FF` |
| `onPrimary` | `#FFFFFF` | `#0A1A4A` |
| `primaryText` | `#2A4FD6` | `#9DB5FF` |
| `primaryContainer` | `#E8EEFF` | `#17275A` |
| `onPrimaryContainer` | `#1A3797` | `#D7E1FF` |
| `secondary` | `#087E78` | `#73DED2` |
| `secondaryText` | `#06716C` | `#73DED2` |
| `onSecondary` | `#FFFFFF` | `#00332F` |
| `secondaryContainer` | `#DBF4F1` | `#0A3834` |
| `onSecondaryContainer` | `#05504C` | `#B6F1E9` |
| `tertiary` | `#F36B52` | `#FF9A85` |
| `onTertiary` | `#161A24` | `#3A0D04` |
| `tertiaryContainer` | `#FFE9E3` | `#45190F` |
| `onTertiaryContainer` | `#952F1B` | `#FFD4CA` |
| `brand` | `#315BEE` | `#88A5FF` |
| `onBrand` | `#FFFFFF` | `#0A1A4A` |
| `accent` | `#2A4FD6` | `#9DB5FF` |
| `accentSoft` | `#E8EEFF` | `#17275A` |
| `selected` | `#E8EEFF` | `#17275A` |
| `onSelected` | `#1A3797` | `#D7E1FF` |
| `focus` | `#315BEE` | `#88A5FF` |


## 4. Contrast verification (actual pairings, computed from the shipped tokens)
| Pairing | Roles | Light | Dark | Minimum |
|---|---|---|---|---|
| Body text | `text` on `canvas` | 16.62 | 19.24 | 4.5:1 |
| Secondary text | `textSecondary` on `surface` | 7.16 | 11.48 | 4.5:1 |
| Muted text | `muted` on `elevated` | 5.40 | 7.23 | 4.5:1 |
| Primary button label | `onPrimary` on `primary` | 5.44 | 7.04 | 4.5:1 |
| Link / primary text | `primaryText` on `canvas` | 6.30 | 10.49 | 4.5:1 |
| Link on tinted chip | `primaryText` on `primaryContainer` | 5.68 | 7.11 | 4.5:1 |
| Selected chip label | `onSelected` on `selected` | 8.89 | 10.92 | 4.5:1 |
| Live (teal) text | `secondaryText` on `surface` | 5.86 | 11.79 | 4.5:1 |
| Live button label | `onSecondary` on `secondary` | 4.92 | 8.65 | 4.5:1 |
| Coral container label | `onTertiaryContainer` on `tertiaryContainer` | 6.67 | 11.10 | 4.5:1 |
| Success badge | `success` on `successContainer` | 4.92 | 8.08 | 4.5:1 |
| Warning badge | `warning` on `warningContainer` | 5.49 | 9.21 | 4.5:1 |
| Error badge | `danger` on `dangerContainer` | 4.99 | 7.29 | 4.5:1 |
| Info badge | `info` on `infoContainer` | 5.18 | 8.16 | 4.5:1 |
| Primary fill vs canvas (non-text) | `primary` on `canvas` | 5.20 | 8.87 | 3:1 |
| Control border (non-text) | `borderStrong` on `surface` | 3.76 | 4.52 | 3:1 |
| Focus ring (non-text) | `focus` on `canvas` | 5.20 | 8.87 | 3:1 |
| Rating star (non-text) | `rating` on `surface` | 4.64 | 11.54 | 3:1 |
| Disabled label | `onDisabled` on `disabled` | 4.58 | 5.40 | 3:1 |

`tests/palette-contrast.test.mjs` (9 tests) enforces:
- every text role on every surface (4.5:1);
- every on-colour and container pairing (4.5:1);
- borders, focus, primary/secondary fills and rating against canvas and surface (3:1, WCAG 1.4.11);
- disabled perceivability (3:1);
- brand/status separation (coral is not danger; teal is not success);
- neutral, untinted true-black dark surfaces;
- the shipped palette matching its generator;
- all three candidates held to the same bar;
- no icon or top-level text falling back to platform black.

No existing contrast assertion was relaxed. The previous "light palette must remain unchanged" pin was replaced by a pin on the new values.

## 5. Light/dark consistency evidence
Before/after pairs, with identical fixture content and colour as the only variable, in `evidence/colour/`:
- `{screen}-{light|dark}-before-after.png` for home, search, everest-live, business-profile (storefront/service detail), shop, messages, social, business-today, business-jobs, business-calendar and account;
- 320px pairs for home, business-jobs and messages.

Dark mode keeps true-black canvases with neutral grey surfaces. Containers (`primaryContainer` `#17275A`, `secondaryContainer` `#0A3834`) carry a subtle tint, so selected states read as selected without tinting whole surfaces.

## 6. Files and components updated
- **Tokens and tests:**
  - `lib/theme-colors.ts` (generated);
  - `scripts/palette-candidates.mjs`, `scripts/apply-palette.mjs`;
  - `lib/theme.tsx` (`useThemedStyles`, `useOptionalThemeColors`, web focus variable);
  - `tests/palette-contrast.test.mjs`.
- **Shared components:**
  - `AppText` defaults to the theme text colour;
  - `AppButton` disabled primary uses the disabled roles;
  - `ServiceCategoryGrid` tinted tiles;
  - `EverestLiveMiniPlayer`, `AmbientEdge`, `LiveSearchMap.web/.native` get the teal Live identity and neutral map labels.
- **Screens:**
  - Everest Live, Home and Product: semantic Live/stock colours.
  - Reviews: rating colour.
  - Social and Account: promoted badges.
  - Available now and Business customers: truthful status colours.
  - Business Jobs: selected chips.
  - Cart and Request: disabled CTA.
  - Business verification: identity card.
- **Newly themed (previously no dark mode):** admin, admin-operations, business (onboarding), business-verification, driver-onboarding, driver-verification, saved, service-areas and delete-account, via `scripts/theme-codemod.py`.
- **Web shell:** `app/+html.tsx` (pre-hydration canvas, theme-color per scheme, focus ring, composer focus) and the `app/_layout.tsx` error boundary.
- **Unchanged on purpose:**
  - the Everest peak logo and app icon (`#151513` adaptive background);
  - splash and PWA manifest (black, which matches the dark canvas and the logo);
  - white/black text over photos and video (stories, clips, media overlays);
  - Google/Apple sign-in button colours (their brand rules).
  - Any logo or app-icon change should be proposed separately.

## 7. Outstanding issues and unverified behaviour
- **Not tested with users.** No beta environment or participants were available, so first impression and preference rest on design reasoning and the screenshots, not measured preference or task-clarity data.
- **Increased contrast:** iOS "Increase Contrast" and Android high-contrast text are not wired to separate token sets yet. The palette has headroom (most text pairs exceed 5:1), but a dedicated high-contrast variant is a follow-up.
- **No physical-device review.** P3 vs sRGB, True Tone and outdoor legibility are unverified. The native map styles changed but were not rendered on a device.
- **Older bespoke surfaces:** about 370 `accent` uses were reviewed by pattern rather than one by one. Semantic misuses found by search were fixed; others may remain on rarely visited screens.
- **Home is still mostly grey above the fold in light mode.** Real business photos and post media are expected to provide the richness; fixtures have no images.
