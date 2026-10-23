# Production release and recovery — blocked, owner-operated

**There is no approved production migration execution order yet.** The following is the exact candidate review order. All nine files remain unapplied and require staging evidence, usable backups, a complete rollback rehearsal and explicit production migration approval. No blanket `supabase db push`, history repair, reset, alias migration or migration from an older blocked PR is selected.

| Order | Candidate migration | Purpose |
| ---: | --- | --- |
| 1 | `20261018032359_phase5_public_discovery.sql` | Verified public discovery/guest predicate and two booking-setting columns |
| 2 | `20261019034703_phase6_live_matching_correctness.sql` | Radius, start-time and active-member eligibility |
| 3 | `20261019035131_phase6_authorized_comment_moderation.sql` | Authorized comment hide RPC |
| 4 | `20261019035613_phase6_live_request_quote_lifecycle.sql` | Live wave/quote lifecycle correctness |
| 5 | `20261019081535_phase7_quote_acceptance_lock_order.sql` | Request-first quote locking and post-wait revalidation; financial tail preserved |
| 6 | `20261022120000_restore_public_guest_reads.sql` | Guest public reads, bidirectional blocks and public stock visibility |
| 7 | `20261022121000_restore_admin_driver_review_access.sql` | Grants for current controlled driver/compliance APIs; legacy all-in-one verifier stays restricted |
| 8 | `20261022122000_business_conversation_customer_names.sql` | Authorized conversation display identity; private alias/avatar excluded |
| 9 | `20261022123000_admin_read_stripe_event_metadata.sql` | Password+MFA-admin read-only processing metadata; no payment changes |

The [inventory](migration-inventory.json) records exact SHA256 values, names and versions. Recompute it from a fresh read-only production history before approval. Current figures: 244 tracked files; 239 registered entries; 235 version/name matches, including 26 trimmed source MD5 matches and 209 unverified representations; 9 pending files; no version/name collision; 4 remote-only entries. Current metadata does not establish full schema equivalence.

Remote-only entries requiring authoritative source/baseline reconciliation:

- `20261002125208_business_listing_payout_override`
- `20261003043651_lc_events_client_intake_storage`
- `20261003043838_lc_events_delivery_settings`
- `20261003050944_fix_lc_edge_service_role_table_privileges`

Do not reapply, delete, fabricate or repair these entries to make the ledger appear aligned. LC Events is co-resident infrastructure and remains outside this code change. No payment override was imported.

## Before any production migration

1. Establish a real isolated Supabase staging project with separate Auth, database, Storage, Realtime and outbound integrations. Creating a branch on the connected production project's current plan was rejected. Do not substitute production or its default main branch. Do not copy real customer records, payment credentials, webhook secrets, tokens or settlement state into fixtures.
2. Obtain/review the complete schema, roles, grants, functions, policies, triggers, extensions and remote-only SQL. Independently review privileged APIs and the acceptance function. Run the full customer/provider/staff/removed-staff/admin lifecycle, guest discovery, cross-account denials, two-session realtime, concurrent quote acceptance/retry/expiry/cancellation, rollback and marketplace fulfillment tests using real staging sessions.
3. Verify a recent usable backup/PITR recovery point and restore operator permissions for the entire project, including financial and co-resident LC Events data. Restore it to an isolated target and record the actual restore time/results. A catalog JSON snapshot or focused fixture is not a backup.
4. Capture exact before-definitions, owners, EXECUTE ACLs, table/column grants, relevant RLS/storage policies and existing function presence. Rehearse applying the exact nine files, restoring the before-state in reverse dependency order and reapplying on the full staging schema. Reconcile any writes made during rehearsal. Keep migration ledger changes deliberate and reviewed.
5. Plan traffic coordination and rollback. The quote function is payment-bearing even though rates/financial logic were preserved. Do not restore its known deadlock under live acceptance traffic. Prefer a reviewed forward correction or pause the affected actions while restoring a compatible app/database state. Do not delete bookings, reset inventory, recalculate money or drop populated tables as a rollback shortcut.
6. Obtain explicit production migration approval for the named files and checksums. Source merge approval and manual Vercel deployment authority do not provide this approval.

The local 21-case new-migration suite includes transactional rollback of grants, policies and new APIs on a controlled schema, and the previous transaction suite rehearses focused acceptance restoration. **A full production backup restore/rollback/reapply is still BLOCKED.**

## Test aliases and clean migration review

`npm ci` prepares 95 compatibility symlinks for older tests inside `supabase/migrations`. These are untracked, test-only aliases and include a customer-portal fixture. They must never be submitted to a database CLI or deployed.

After all tests, an operator can remove only the recognized aliases:

```sh
node scripts/prepare-legacy-migration-aliases.mjs --clean
npm run audit:migrations
git status --short -- supabase/migrations
```

Cleanup refuses real files and unknown symlink targets. Do not use an unrestricted `git clean` or glob deletion. Running `npm ci` again regenerates aliases, so clean and inspect again before any migration operation. Use only the approved canonical file selection; this cleanup alone does not authorize applying SQL.

## Source merge gate

Before merging #111, complete relevant staging/security/native validation and the exact-head code checks. Re-inspect current main, PR diff and production SHA. Confirm Vercel main Git deployment is disabled in both source and effective project configuration, no deployment hook/GitHub workflow will publish production, and Supabase Git integration will not auto-apply production SQL. Project-scoped Vercel inspection currently returns 403, so management-side verification/operator recovery access remains blocked. Do not merge a release-blocked draft on the strength of historical CI.

Keep this configuration in the final source:

```json
{"git":{"deploymentEnabled":{"main":false}}}
```

Vercel's official schema explicitly defines the branch map and uses `main:false` as its example. The production SHA remains unchanged after the existing main merge and this integration's preview pushes, but that observation is not a replacement for effective project-settings verification.

## Manual deployment by the owner — only after every mandatory gate passes

These commands are instructions, **not commands run by the agent**. Verify the team/project and approved merged SHA before invoking them. Never deploy a stale checkout, an unresolved migration branch or the draft integration merely because a preview is READY.

1. Complete the approved database rollout/recovery checklist above and post-migration staging/production read-only smoke checks. Confirm frontend/backend compatibility and monitoring ownership.
2. Merge only the validated source; record the final main SHA and merge URL. Recheck production still serves the old expected SHA, proving source merge remained separate from release.
3. From a clean checkout of that exact main SHA, install/build for the intended production project. Use the owner's authorized Vercel scope and existing production environment configuration:

```sh
vercel link --project everest-local-app --scope team_dsF0uzqRx5WaRhQlCndgzo0e
vercel pull --yes --environment=production --scope team_dsF0uzqRx5WaRhQlCndgzo0e
EVEREST_RELEASE_SHA="$(git rev-parse HEAD)"
VERCEL_GIT_COMMIT_SHA="$EVEREST_RELEASE_SHA" VERCEL_ENV=production vercel build --prod --scope team_dsF0uzqRx5WaRhQlCndgzo0e
test "$(node -p "require('./dist/build-info.json').commit")" = "$EVEREST_RELEASE_SHA"
vercel deploy --prebuilt --prod --scope team_dsF0uzqRx5WaRhQlCndgzo0e
```

4. Verify `https://everest-local-app.vercel.app/build-info.json` reports the approved final main SHA, deployment is READY, public discovery works, error monitoring is quiet and controlled acceptance evidence remains valid. Record the deployment URL/ID and previous verified deployment/rollback path.
5. Keep `git.deploymentEnabled.main=false`; publishing once manually does not authorize future automatic production deploys.

No production promotion/redeployment, domain/alias modification, production migration, live synthetic payment or booking was executed in this task.
