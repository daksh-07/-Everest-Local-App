# Database rollout and rollback — separate release gate required

> Historical Phase 6 checkpoint at `152188f`. See [Phase 7 evidence](../phase7-evidence/README.md) for the acceptance lock-order correction, updated migration inventory and current release gates.

**Current recommendation: NO-GO for production.** The PR is for code/SQL review. No migration has been applied to production, no production test transaction was created, and no deployment was initiated. Merging main can trigger its existing deployment integration: do not merge before the database and staging gates below are signed off.

## Before any rollout

1. Use a clean checkout of the reviewed commit, separate from the test workspace. Do not run `npm ci` in that migration checkout: the existing postinstall prepares 96 legacy SQL aliases for historical tests. Those generated aliases are not rollout inputs. Compare only tracked migration files and authoritative remote migration history.
2. Verify the target project reference and restore/PITR capability. Record the deployed app SHA, remote migration versions, function definitions, function ACLs, relevant table/column privileges and policies. Protect the backup as operational configuration; do not commit credentials or customer data.
3. Review migration-history drift. Read-only production history currently ends at `20261003050944`. The default Supabase branch record also carries a historical MIGRATIONS_FAILED status. This is not proof that current production is unhealthy, but it requires an operator to reconcile history before selecting pending SQL. Do not use `migration repair`, `--include-all`, `db reset`, broad grants or blanket schema pushes to silence a mismatch.
4. First use an authorized nonproduction Supabase project with the production schema, real Auth identities and Realtime configuration. This environment has none. The included PostgreSQL fixtures are not a replacement for that gate.

CLI commands below are examples for the release operator, **not executed against production in this task**. Supply connection values through an approved secret manager, not committed files or pasted logs. Inspect command help for the installed CLI version.

```sh
supabase migration list --db-url "$EVEREST_STAGING_DB_URL"
supabase db push --db-url "$EVEREST_STAGING_DB_URL" --dry-run
```

The dry-run must list exactly the reviewed pending migrations, with no legacy alias, unrelated infrastructure or payment SQL. Otherwise stop and reconcile the inventory.

## Reviewed order

| Migration | Effect |
| --- | --- |
| `20261018032359_phase5_public_discovery.sql` | Reviewed #107 public search guards, boolean predicate execution and two booking-setting column grants/RLS |
| `20261019034703_phase6_live_matching_correctness.sql` | Radius, availability start and active-member assignment eligibility |
| `20261019035131_phase6_authorized_comment_moderation.sql` | Narrowly authorized boolean-only hide operation; preserve visible-only read policy |
| `20261019035613_phase6_live_request_quote_lifecycle.sql` | Preserve matching fixes; enable existing QUOTING contract when Live releases offers |

Execute with the migration system in the reviewed order and transactional failure handling. Apply no additional pending SQL by inference. Replacements preserve existing function signatures/ownership; no tables or customer rows are dropped or backfilled. Existing offers are not retroactively removed. The Live correction changes eligibility for subsequent waves only.

## Staging acceptance gate

- Repeat all repository SQL tests locally against a disposable PostgreSQL 17 database, then validate actual Supabase API behavior using anon, customer, provider, staff, removed staff and administrator accounts. Verify private/unverified rows and unauthorized writes remain denied; an administrator needs the existing password-plus-MFA requirements.
- Through the real UI/API create a staging request, confirm matching and notification recipients, quote, accept, create booking and complete it through the existing authorized workflow. Inspect request, offer, quote, booking and assignment rows after each step. Do not fabricate a successful payment or disable any existing completion guard to make this pass.
- Race two providers accepting and two customer quote decisions. Confirm one committed assignment/booking. Track remaining `40P01` quote-lock errors; ensure a failed/lost-response client refreshes authoritative state. This PR does not modify the payment-bearing acceptance function.
- Cover cancellation versus acceptance, stale offers, provider offline/location staleness, reconnection, duplicate actions and lost responses. The supplied SQL tests cover these contracts in focused fixtures; they do not prove the complete production schema, external services or push delivery.
- With two real authenticated staging accounts, post/reply/edit/hide comments through PostgREST and verify both clients' Supabase Realtime state. Test unauthorized moderation, draft isolation, lost sends and stale edits. The frontend depends on `hide_post_comment`; apply that migration before releasing this frontend.
- Repeat mobile WebKit/Chromium coverage and physical iOS/Android maps, keyboard/safe-area transitions and VoiceOver/TalkBack checks. Record physical device/OS versions; browser viewport emulation does not satisfy this gate.

Check the proposed exposure after applying to staging:

```sql
select
 has_function_privilege('anon','public.universal_search(text,text,integer,integer)','EXECUTE') as guest_search, -- true
 has_function_privilege('anon','public.release_everest_live_wave(uuid,numeric,integer)','EXECUTE') as guest_internal_wave, -- false
 has_function_privilege('authenticated','public.release_everest_live_wave(uuid,numeric,integer)','EXECUTE') as member_internal_wave, -- false
 has_function_privilege('anon','public.hide_post_comment(uuid)','EXECUTE') as guest_moderation, -- false
 has_function_privilege('authenticated','public.hide_post_comment(uuid)','EXECUTE') as authenticated_moderation; -- true, caller authorization still required
```

Confirm the service-booking-setting column allowlist and test a nonpublic row, not merely an empty response. Run Supabase security advisors and review intentional SECURITY DEFINER exposure individually. Do not silence findings by broad grants. Existing advisor references: [public privileged APIs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Only after staging evidence, migration inventory, rollback rehearsal and an explicit release approval are recorded may an operator apply the same reviewed SQL to production. Repeat read-only privilege/catalog checks and public discovery smoke checks there. Do not run this task's synthetic transactions in production. Release the compatible frontend only after schema-cache/RPC availability is confirmed. Keep an operator monitoring errors, matching geography, offer counts, moderation failures and acceptance conflicts.

## Rollback

- Prefer a reviewed forward correction. Restoring the previous Live function reintroduces the verified matching/state defects; do not use it as an unattended rollback. Existing offers/bookings are not deleted to undo eligibility changes.
- If rollback is necessary, stop the release and prevent new affected actions through the existing operational release controls. Restore the exact saved `release_everest_live_wave` definition and its owner-only ACL in one transaction. Do not restore the intermediate three-fix version accidentally if a full rollback was intended. Validate catalog hashes and request/offer counts against the captured baseline.
- Discovery: restore the saved `universal_search` definition/ACL and exact prior privileges. Remove only `service_booking_settings_guest_read` and the newly introduced anonymous two-column grants/predicate permission if the baseline did not contain them. Do not revoke authenticated privileges or modify other policies. Confirm private branches remain closed; expect guest discovery to become unavailable again.
- Comments: the new authorized RPC is additive and can remain while the frontend rolls back. If removal is required, release the compatible old frontend first, then revoke execution/drop only the new function. Do not relax visible-only SELECT RLS or expose hidden bodies as a workaround. Hiding is a soft status change; never mass-unhide customer moderation history during rollback.
- Record rollback in migration history with a new reviewed corrective migration. Do not edit already applied files, repair history blindly, reset production or touch payment/commission/pricing functions.
