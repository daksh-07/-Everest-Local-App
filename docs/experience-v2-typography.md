# Everest typography and palette implementation

This completes the active frontend discovery release’s typography directive. It does not claim releases C–F or authenticated transaction/native-device validation are complete.

## Implementation

- `lib/typography.ts`: explicit hero, title, section, card, body, supporting, metadata, button and price roles. Bricolage 600/700 is concentrated in selected headings; Inter 400/500/600/700 handles functional text.
- `AppText`/`AppTextInput`: preserve native props, refs, nesting, selection, keyboard behavior and default text scaling. Existing 800/900 styles resolve to a real Inter 700 face. Icon fonts retain their original RN Text. Most screen changes are mechanical import substitutions; chat transaction/scroll/composer state is preserved.
- Web: self-hosted static WOFF2s discovered in the HTML head, three early preloads, other faces on demand, readable system fallback and `font-display: swap`. No external font service or variable axes. Six faces total 552 KB on disk; measured Home font responses total 435,148 bytes.
- Native: Expo SDK 54 font plugin embeds static TTFs. Their filenames match verified internal PostScript names. Isolated iOS/Android prebuild succeeded: all six fonts appear in Android assets and iOS UIAppFonts. Existing development binaries load bundled assets without blocking auth/navigation/splash and retain system text on failure. A prebuild is not a device rendering test or signed store build.
- `lib/theme-colors.ts`: beige fills, charcoal on-brand text, warm grey/ivory surfaces, contrasting bronze foreground and semantic red/blue/green. Older components no longer use pale beige for text/icons. Palette regression checks require AA 4.5:1 for text, supporting text, accent and semantic colors across standard surfaces, and on-brand labels. Product availability uses semantic green.
- Home starts at 32 px display type (34 Pulse), useful sections at 20 px; longer business/product names use 600 rather than 900. Navigation is 12 px, 11 on narrow layouts, with a real 600 face. Product prices and operational figures use tabular numerals.
- The visual loop found the floating assistant obscuring product/business content; it is hidden on those detail routes while existing assistant navigation remains available elsewhere.

## Source and licensing

Unmodified upstream static assets and full OFL 1.1 notices are retained in `assets/fonts` and distributed notices in `public/fonts`. See [font provenance](../assets/fonts/README.md). All six contain ₹; no Fraunces loader existed in these surfaces. Non-Latin Indian scripts use platform fallback; no third general-purpose font is bundled. No India payment or market boundary behavior changed.

## Visual loop and validation

Before → implement → capture → inspect → refine → recapture. Six actual app routes are compared: Home, Search, Business Profile, Product Detail, Chat and Business Today. Public Home/Search use actual signed-out reads. Other routes use explicitly labelled, inert, intercepted transport fixtures, including a long business name/product name, multi-line messages, AUD price and an unverified new-owner Today state. These captures do not prove real account permissions or transactions.

See [the six-screen comparison sheet](experience-v2-evidence/typography/comparison.html) and [raw font measurements](experience-v2-evidence/typography/font-performance.json). Both Chromium and WebKit passed 84 local typography combinations; the hosted preview passed Home/Search interactions and Chromium 36 typography combinations with actual loaded-font assertions. Font-download failure also leaves Home/categories usable. Phone widths are 320/360/375/390/430, tablet 768 and desktop 1440, light/dark; discovery also checks DEFAULT/PULSE/CLASSIC. Chromium and WebKit are browser emulation, not physical Android Chrome or iPhone Safari. Native keyboards, Dynamic Island/home indicator, VoiceOver/TalkBack, native text scaling and hardware animation performance still require devices/EAS builds.

## Performance limits

The foundation’s separately measured Home startup REST reads are 20 → 6 (70% fewer), with retained screens and scoped polling. The typography snapshot measured layout shift about 0.0013 before, 0.0051–0.0123 after and 0.0048–0.0049 with fonts delayed 1.8 seconds. Three-run timings varied under concurrent browser load and do not establish a startup speed gain. Four to eight >50 ms startup tasks remain; no 60 fps or main-thread cure is claimed. Raw measurements are retained with evidence.

## Release gate

Use PR #99’s final CI and exact hosted build metadata as the source of truth. Local typecheck, lint (zero errors, 12 existing warnings), Node suite, static/migration audits and export are checked again before merge. Local Expo Doctor could not reach two remote metadata endpoints; GitHub CI’s actual Doctor result is recorded at delivery. Supabase preview provisioning is skipped; no migrations/functions/payments/RLS changes are part of this frontend release.

Remaining sequence: authenticated service/request/booking refinement, bounded Business Today priority reads and worker queues, coordinated #97 staging/Stripe/inventory verification, then isolated #93/#94 India preparation with payment gates. See the continuation handoff for backend blockers.

## Local completed quality checks

- Typecheck / export: passed.
- ESLint: 0 errors, 12 pre-existing warnings.
- Node: 413 passed, 0 failed.
- Static audit: 658 files, 96 routes; migration audit: 235 migrations.
- Navigation specialist: 20 passed; full suite includes messaging, security, booking/commerce, Live and native-store source/config checks.
- Current deployed Release A Home suite passed independently on production.
- Hosted Git integration preview: exact `5961abd` confirmed in public build metadata. Final documentation/QA-only commits require their own exact-head preview/CI verification.
