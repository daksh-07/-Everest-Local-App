# Design decisions — 28 October 2026

Keep `lib/theme-colors.ts`, `lib/experience.tsx`, `lib/typography.ts`, `AppText`, `AppTextInput`, `SectionStatus` and shared error/skeleton components. No competing palette or dependency introduced. DEFAULT is the stored Everest experience; PULSE and CLASSIC remain valid persisted choices. Behavior is shared across modes; reduced-motion preference controls modal animation.

| Element | Decision | Reason / validation |
|---|---|---|
| Home main intent hierarchy | Keep | Search/quote/urgent tasks precede social content already |
| Five customer tabs/deep links | Keep | Avoid migration without completed journey evidence |
| Business Today attention before CRM | Keep | Already matches jobs-first; inspect employee permissions next |
| Location title | “Your browsing location” | Selection ranks discovery, does not certify a business service area |
| Location CTA | “Use this location” | Does not promise every result is inside a geographical boundary |
| Country | Explicit user choice, no hidden Australian default for locality lookup | Avoid incorrect geography; country is required for disambiguation |
| Optional city/region | Visible labelled inputs | Preserve specificity without implying both are required; progressive disclosure remains a hypothesis |
| Error and pending states | Error focuses missing input; progress on triggering action; editable values preserved after failure | Understandable recovery; fixture-tested |
| Home business heading | “Businesses on Everest” with scope explanation | Current fallback includes other locations |
| Empty service/business/all search | Category recovery + quote request shortcut | Makes next action available at the dead end; does not guarantee matching |
| Empty filtered results | Remove photo filter | Reversible recovery without erasing query |

Touch targets in the changed actions are 44–50 px minimum. Colors inherit existing light/dark theme tokens. Existing global web focus CSS is retained. No new motion or image assets. Native screen-reader, keyboard and large-font acceptance remains a release gap; a Chromium viewport is not a physical device.
