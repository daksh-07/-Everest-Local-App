# Production release and rollback — NO-GO

No production SQL, synthetic transaction, merge or deployment was executed. This is a concrete release package awaiting mandatory gates, not an approval request to bypass them.

## Gates before requesting release approval

- [ ] Separate accessible staging project and real role accounts, including two comment sessions and password+MFA administrator.
- [ ] Full baseline replay and inventory reconciliation, including four remote-only entries and 209 unverified source representations. Five pending files only; no history repair.
- [ ] Independent review of the isolated payment-bearing acceptance migration and complete staging trigger/dependency behavior.
- [ ] Actual lifecycle, PostgREST/RLS, realtime comments, geographic matching, concurrency, timeout/lost-response recovery and unauthorized-role acceptance all pass.
- [ ] Recent usable backup/PITR, restore authority, tested acceptance maintenance/quiescence procedure and full staging rollback/reapply rehearsal. The focused local function rehearsal does not satisfy this gate.
- [ ] Physical iOS/Android and screen-reader acceptance; Chromium/WebKit and final source CI green.
- [ ] Vercel deployment scope access restored; current production build and error baseline captured.
- [ ] Explicit release approval for the exact reviewed Git SHA and SQL SHA256 inventory after all preceding evidence exists.

Use [STAGING.md](STAGING.md) and [MIGRATIONS.md](MIGRATIONS.md). Compare the saved catalog baseline with fresh production read-only metadata immediately before release; stop on drift. The public production SHA at audit is `95b8d489c98109717bcb8d6ef53d54674c4b5ab7`.

## Proposed approved execution order

1. Take protected full backup/PITR reference and fresh definitions/owners/ACLs, relevant policies and column/table privileges. Verify target project explicitly. Confirm reviewed migration inventory and application compatibility.
2. Apply only these files through the approved migration mechanism, in order, with transactional failure handling:
   - `20261018032359_phase5_public_discovery.sql`
   - `20261019034703_phase6_live_matching_correctness.sql`
   - `20261019035131_phase6_authorized_comment_moderation.sql`
   - `20261019035613_phase6_live_request_quote_lifecycle.sql`
   - `20261019081535_phase7_quote_acceptance_lock_order.sql`
3. Confirm history entries and function/ACL fingerprints. Verify `hide_post_comment(uuid)` exists; authenticated EXECUTE only. Confirm anonymous universal_search cannot return private/social branches, the two booking-setting columns only, and internal Live wave remains non-executable to clients. Verify accept_quote remains authenticated-only and all changed function owners remain expected.
4. Confirm PostgREST schema cache recognizes the moderation RPC. Do not release dependent frontend before that check.
5. Merge the approved PR head; watch the existing Vercel production deployment, then compare `/build-info.json` to the actual merge SHA. GitHub CI or a queued deployment is not deployment proof. No forced redeploy, unrelated settings, Stripe configuration or price/commission change.
6. Use read-only/non-synthetic smoke checks for public discovery, existing authorized Live state and comment views. Do not create production test requests, comments, bookings or transactions. Review application/DB error signals, matching geography, moderation/RLS errors and lock/deadlock metrics with an operator. Maintain a live rollback contact and evidence record.

## Rollback

Quiesce affected acceptance flows using the procedure rehearsed in staging before restoring old SQL. The old accept_quote has the reproduced deadlock; restoring it is an emergency rollback, not a safe final state. In a reviewed corrective migration, restore its exact captured definition/owner/ACL and verify the baseline fingerprint (`6c382d3ba10baee61594ad34bb72060b` with the captured PostgreSQL pg_get_functiondef representation). Do not delete or rewrite bookings, quotes, assignments or payment rows.

The two Phase 6 Live replacements restore as one exact saved baseline, not an accidentally selected intermediate function. Restore discovery's saved function/ACL and only the newly introduced anonymous privileges/policy if rolling it back. Do not modify unrelated authenticated rights. The additive hide RPC can remain while the frontend rolls back; remove it only after dependent frontend code is gone. Never expose hidden comment bodies to work around RLS.

Verify database invariants and catalog before resuming traffic. A frontend rollback alone does not undo schema or data, and a SQL rollback does not prove app compatibility. Record a new corrective migration; do not edit applied files, repair/reset history or mass-unhide moderation records. Full restore and rollback remain unverified release gates.
