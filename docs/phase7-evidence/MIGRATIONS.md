# Migration reconciliation — read-only production snapshot

Captured 2026-10-19. Production is ACTIVE_HEALTHY, PostgreSQL 17.6. History: **239 entries**, ending `20261003050944`. The only branch record is default main; its MIGRATIONS_FAILED status and last update both date to 2026-09-17. It is historical metadata; it neither proves current outage nor certifies replay. No history was repaired.

Reproduce the offline inventory: `node scripts/audit-phase7-migrations.mjs`. Inputs are the sanitized read-only history in remote-migrations.json and tracked SQL. The report records every tracked file and remote-only entry, versions, names and hashes.

| Classification | Count | Meaning |
| --- | ---: | --- |
| Local + remote version/name present | 235 | Already registered; do not reapply |
| Of those, trimmed full-source MD5 equal | 26 | Byte match after outer trim |
| Of those, source representation/content unverified | 209 | Statement splitting/formatting or content may differ; not certified equivalent |
| Pending release SQL | 5 | Not registered remotely; release-gated below |
| Remote-only history entries | 4 | Missing from this checkout; obtain authoritative SQL/schema baseline before replay |
| Version/name collision | 0 | No collision in captured metadata |

Remote-only entries: `20261002125208_business_listing_payout_override`, `20261003043651_lc_events_client_intake_storage`, `20261003043838_lc_events_delivery_settings`, `20261003050944_fix_lc_edge_service_role_table_privileges`. They were not copied, altered or reapplied. Their absence and the unverified content prevent a claim of full migration/schema equivalence. Do not add unrelated infrastructure or payment changes to this release to make history appear aligned.

Required pending order:

1. `20261018032359_phase5_public_discovery.sql` — reviewed public discovery, anonymous boolean predicate and two booking-setting columns; no private social branches.
2. `20261019034703_phase6_live_matching_correctness.sql` — radius/start-time/active-member eligibility.
3. `20261019035131_phase6_authorized_comment_moderation.sql` — boolean-only authorized hide RPC; no broader SELECT.
4. `20261019035613_phase6_live_request_quote_lifecycle.sql` — preserves matching and sets QUOTING after released offers.
5. `20261019081535_phase7_quote_acceptance_lock_order.sql` — request-first accept_quote, post-wait quote revalidation, unchanged financial/state tail and existing authenticated-only EXECUTE. Requires separate payment-bearing-function review and staging verification.

All five are **BLOCKED for production application** pending staging, reviewed inventory, recovery rehearsal and explicit release approval. No other SQL is selected for rollout. Full-source SHA256 values are in migration-inventory.json.

Catalog baseline captures the three pre-release replaced function definitions (accept_quote, release_everest_live_wave, universal_search), ownership/ACLs, relevant policies and privileges; other traced definitions are fingerprinted. hide_post_comment is absent in production and must exist before its dependent frontend releases. Existing quote table privileges permit authenticated SELECT only and the only quote policy is SELECT: direct customer/provider quote writes cannot bypass the authoritative request-first RPC order.

The catalog snapshot is **not a database backup**. Managed restore/PITR availability and a rollback rehearsal are unverified. Restore operator access and a recent restorable recovery point are mandatory gates.
