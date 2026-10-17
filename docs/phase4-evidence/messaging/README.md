# Messaging keyboard/composer correction

The owner confirmed the supplied iPhone screenshot came from a Safari home-screen shortcut (installed PWA). “Write with Siri”, keyboard keys and the previous/next/done accessory toolbar belong to iOS. No replacement keyboard or accessory suppression was introduced.

## Root causes and fixes

- The shipped SPA takes its HTML from `public/index.html`. Earlier thread viewport rules existed only in `app/+html.tsx`, so they were absent from the exported production HTML. A shared `public/chat-layout.css` now ships through both entry points. Web-export validation checks its presence.
- The thread now follows `visualViewport.height` and `offsetTop` as one viewport owner. Keyboard/accessory height is not subtracted again. Page scrolling is locked only while a visible thread is open, with cleanup when navigating away. Native iOS retains KeyboardAvoidingView; Android retains OS resize. Native safe-area padding returns after keyboard dismissal, rather than during its animation.
- An unconstrained multiline textarea rendered a 58px input and 72px composer. A one-row textarea now starts inside a **52px composer**, expands naturally, shrinks after deletion/send and scrolls internally at a 120px text-area cap. Send has a 44px target, disabled semantics and readable disabled tokens. Sending preserves focus. No decorative glow or large shadow.
- Short conversations sit above the input. Initial/history layout anchors correctly. Readers of older history retain position through viewport changes. Header controls remain visible; tabs and the Live mini-player stay hidden in threads.
- Deep-link parameters are consumed once: Back no longer reopens the old conversation on refresh. Late responses are scoped to their thread. Draft/reply/edit context is scoped to each conversation.

## Evidence and validation

`before/` records the previous implementation at 390px, light/dark. Its measurements show an 844px thread remaining 844px after a simulated 420px visible viewport, with a 72px composer.

`after/` contains representative 390px light/dark screenshots, a machine-readable measurement report and short WebM recordings. Keyboard-occlusion screenshots crop to the app's visible area. They **do not depict an actual iOS keyboard**. Recordings show simulated visible-viewport transitions in a desktop browser, not a physical-device capture.

The real MessagesScreen runs against isolated transport fixtures; no production reads or writes are used. Browser checks cover empty/populated chats, focus, bounded multiline growth/shrinkage, disabled send, sending with focus retained, dismissal/reopening, older-history anchoring, switching conversations, failed-send recovery and navigation away/back. Chromium passed 66 cases across 320/390/1280px and light/dark; the final 390px evidence pass repeats 22 cases. The WebKit CI job runs the same suite plus the existing computed-focus-style regression.

Typecheck passes. The complete suite has 460 passing tests. Lint has no errors and 12 existing warnings. Focused unit checks verify input bounds, one-time viewport occlusion and export stylesheet loading.

## Limits

- No physical iPhone, iOS simulator, Android emulator or native keyboard is available in this Linux workspace. Interactive native dismissal, Apple accessory/Siri behaviour, installed-PWA keyboard animation and device safe-area transitions still need on-device acceptance.
- Local WebKit cannot launch because GTK4 and five other shared libraries are missing; this user environment has no sudo. WebKit is verified by GitHub Actions, which installs browser dependencies. Consult the PR checks for the actual result.
- The existing chat API intentionally exposes no attachment control without a secure chat-media boundary. No attachment implementation was added or removed.
