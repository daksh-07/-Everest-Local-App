# Everest typography assets

These are unmodified static fonts licensed for commercial use and redistribution under SIL Open Font License 1.1. Full copyright/license notices are retained alongside them.

- Bricolage Grotesque: upstream `ateliertriay/bricolage`, pinned commit `84745e5b96261ae5f8c6c856e262fe78d1d6efdd`, `fonts/ttf` and `fonts/webfonts`; SemiBold (600), Bold (700).
- Inter: original `rsms/inter` release **v4.1**, `Inter-4.1.zip`, `extras/ttf` and `web`; Regular (400), Medium (500), SemiBold (600), Bold (700).

Native TTFs are embedded by the Expo SDK 54 `expo-font` plugin; basename and PostScript aliases match exactly. Existing development binaries load the same bundled faces at runtime, retaining system text while loading or on failure. No splash/auth delay is introduced. Native binary/device rendering remains a release check for the next EAS build.

Web WOFF2 files are self-hosted in `public/fonts`. Exact face aliases use `font-weight: normal`, avoiding synthesized 800/900 weights. Only three initially useful faces are preloaded; other faces load on demand. `font-display: swap` preserves readable content under slow/offline conditions; browser QA measures the resulting layout shift instead of promising zero shift.

All six faces contain ₹ and Latin Australian names/accented characters. They do **not** cover every Indian script (including Devanagari). Non-Latin runs rely on platform fallback; no third general-purpose face is bundled. No variable font axes are used. Dynamic text scaling is preserved.
