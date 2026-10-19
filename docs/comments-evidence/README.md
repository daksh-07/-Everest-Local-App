# Post comments UX — verified review checkpoint

Base: production main `d9faf4f62365e3a620effbfc422ad15d7cbd88ea`. Independent of unmerged #107 and operations #108. No migrations, production permissions or payment changes. Automatic deployment disabled for this branch.

## Reproduced on the actual production-main Social screen

The checked-in browser harness opens the exported real SocialScreen, with intercepted backend responses and no production writes.

| Trigger | Before | After |
| --- | --- | --- |
| Write, close and reopen | Draft erased | In-session draft and reply context retained by account and post |
| Comment read fails | “No comments yet” plus unhandled page error | Explicit error and local retry; composer draft retained |
| Tap comment options | Immediately sends hide mutation | Named Hide action, confirmation, safe cancel and success/error feedback |
| Profile or reaction reads fail | Combined dependency blocks conversation | Body, identity and likes load independently; unknown likes stay unknown |
| Send commits but response is lost | Retry can insert another comment | Persisted attempt ID reconciles the original insert, including reopening |
| Many or nested comments | Flat capped list | Stable cursor pagination, bounded thread indentation, ancestor context and sorting |

[Before](before/comments-before.png) · [Failed read before](before/comments-error-before.png) · [Light after](chromium/comments-light.png) · [Dark after](chromium/comments-dark.png) · [Recoverable error](chromium/comments-read-error.png)

## Representative benchmark

This is a focused pattern review, not an exhaustive competitor audit or a claim of being the world's best. Public documentation was reviewed; authenticated competitor apps were not available for hands-on testing.

| Reference | Relevant pattern | Everest implementation |
| --- | --- | --- |
| [YouTube comment help](https://support.google.com/youtube/answer/6000964?hl=en) | Reply, sort, edit and moderate with clear ownership | Newest/oldest order, expandable replies, own-comment edit and confirmed hide |
| [Reddit formatting guide](https://support.reddithelp.com/hc/en-us/articles/360043033952-Formatting-Guide) | Readable paragraphs and structured conversation | Selectable 15px body with 22px leading, multiline 16px composer, bounded indentation |
| Instagram / TikTok familiar interaction patterns | Compact reactions and explicit reply context | Labelled reactions, visible reply recipient, quick emoji and 44px controls; pattern references only, no current-app comparison claim |

TikTok public help returned only a generic shell, so it is not used as verified evidence. Rich text, algorithmic ranking and attachments were deliberately excluded from this focused change.

## Interaction and recovery

- Read without opening the keyboard; close receives focus on web. Named dialog, tab semantics, visible focus, reduced motion and safe hide confirmation.
- Composer grows without taking the whole conversation; mobile visual viewport and native keyboard avoidance keep it reachable. No Enter-to-send surprise.
- Failed posting retains text. Pending mutations prevent duplicate taps. Like failure restores confirmed values. Editing uses expected `updated_at` to prevent silent overwrites.
- Real auth-session identity keys the conversation; stale feed identity cannot reveal another account's draft. Drafts remain in memory for up to one hour, capped at 20 conversations, with no disk persistence.
- Public guest reading and disabled-comment reading remain available. Existing server RLS remains authoritative.
- Realtime events request an explicit refresh without jumping the reader. Disconnection is labelled accurately, and reconnection offers refresh. No claim that unavailable realtime data is current.

## Validation

Passed: TypeScript, 465 unit tests, web export, source/migration audits and lint (0 errors; 12 existing warnings). Chromium and WebKit each passed 11 interaction scenarios, 70 layouts and 2 accessibility scans with 0 violations and 0 page errors. See raw browser results below and `validation.json`. Both engines exercise the actual exported screen with fixtures. Widths: 320, 375, 390, 430 and 1280. Light/dark, reduced/default motion, simulated keyboard, delayed identity, read/reaction/write failures, retry after lost response, account change, pagination, replies, guest and disabled states are covered. Accessibility scans target the changed dialog; they are not whole-application certification.

- [Production-main reproduction](before/results.json)
- [Chromium](chromium/results.json)
- [WebKit](webkit/results.json)

Reproduce with `npm run build:web`, serve `dist`, then run `scripts/verify-post-comments.mjs` with `EVEREST_PREVIEW_URL`, `PLAYWRIGHT_MODULE`, `AXE_MODULE`, and optionally `EVEREST_QA_BROWSER=webkit`. Baseline uses `COMMENTS_BASELINE=1` against the production-main export. Browser tools are isolated from application dependencies and pinned in the new CI workflow.

## Remaining verification

Real staging RLS, multi-user push/realtime delivery and concurrent writes require authorized test accounts. Physical iOS/Android keyboards, VoiceOver/TalkBack and user comfort testing remain necessary. These were not simulated into claims of production verification. Existing Safari messaging files and navigation are untouched. No production deployment was performed.
