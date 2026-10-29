# Persistent request drafts — 29 October 2026

## Decision and scope

Extend the current three-step request rather than add a separate form. Automatically keep editable request details on the device for seven days, within the signed-in account. A visible status explains saving; Home offers Continue request. Restoring asks for an explicit choice, reconfirms location, checks current service availability and clears elapsed date/time preferences. Photos must be reselected; temporary picker URIs are not durable attachments.

Compared alternatives: explicit Save only (misses accidental interruption); server drafts (new schema/RLS and data retention obligations before the core flow is stable); unconditional automatic restoration (can overwrite a deliberate new task); automatic reposting (can create duplicate requests or stale schedules). The selected approach uses existing dependencies and explicit review. This is a design/engineering judgment informed by the existing W3C form/error and progressive-disclosure references; no A/B winner or real-user result is claimed.

## Reliability and privacy

- Versioned schema validates stored fields, bounds sizes and strips unapproved fields. Editable copies exclude coordinates and confirmed pins. Photos and credentials are excluded.
- Web uses device-local browser storage; native uses SecureStore with a device-only keychain setting. Unicode-safe chunks stay below native value limits.
- Generation manifests commit only complete saves. A pending-generation journal cleans interrupted writes. Save/discard/logout are serialised; logout invalidates old writers before clearing local copies.
- Seven-day expiry and account-scoped keys prevent stale/cross-account restoration. This is not protection against someone controlling the same browser/device or origin; no extra telemetry records contents.
- Typing is debounced; navigation/unmount/pagehide/visibility/AppState events request a flush. Sudden OS/process termination and native secure-store behaviour still require physical-device acceptance.
- Before posting, an immutable snapshot and the existing authoritative idempotency key must be saved. If storage fails, posting stops with an error instead of risking an unrecoverable retry.
- Once posting has been attempted, the UI offers status checking and an explicit retry of the same payload/key. It does not allow unnoticed edits to an uncertain submission. Expired timing blocks reposting; status/Activity remain available.
- Once a real request ID is returned, failed photo attachment cannot present the entire request as unposted. Completion clears the local draft; Live start recovery keeps the existing request rather than creating another.

## Validation

Core store tests exercise Unicode chunk sizes, schema bounds, account isolation, seven-day expiry, atomic replacement failure, interrupted-write cleanup, logout invalidation, exact payload/key preservation and stale schedule checks. Browser acceptance exercises refresh before the debounce, Home navigation/resume, authentication interruption/return, address reconfirmation, committed-but-response-lost recovery without repost, uncommitted explicit retry with the identical payload, logout cleanup, and a post-create photo upload failure. All browser traffic is intercepted. Actual provider/payment/customer records are never changed.

Local checks passed: 528 unit/security tests (11 new draft/store/schedule cases); TypeScript; ESLint with zero errors and 11 existing warnings; static and migration audits; web and iOS/Android JS/Hermes exports. The draft browser matrix passed six light/dark/mode configurations, six recovery axe scans, nineteen intercepted posting calls across failure/retry scenarios, logout cleanup and a photo-upload failure. The existing 12-configuration request-location regression also passed. No page errors, horizontal overflow or axe violations were recorded. CI source and PR/preview links will be recorded in the PR once execution completes. Prior #113/#114 evidence is linked in the journey checklist, not relabelled as this source's tests.

## Rollback / remaining boundaries

Revert this isolated PR after prerequisite #114. No database or billing rollback is necessary. Removing the feature stops reading its versioned device-local keys; an explicit local cleanup can use the existing clearAll implementation. Photos, physical kill/background acceptance and real staging request/Live acceptance remain gaps. The full product checklist is `EVEREST_JOURNEY_COMPLETION.md`.
