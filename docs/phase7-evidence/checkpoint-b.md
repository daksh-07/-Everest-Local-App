# Checkpoint B — request-first acceptance

The original accept_quote takes quote A/B FOR UPDATE, then the common request. The winner holds that request while declining the competing quote, which the waiting decision already owns: a cycle. The regression now holds only the request externally and queues both unchanged RPC calls; before: 12 passed checks, 1 failed no-deadlock assertion with 40P01 (one booking survived).

Migration 20261019081535 resolves the quote's request with an unlocked ownership lookup, locks the request, then locks/revalidates quote ownership AND request identity. The entire financial/state/booking/notification tail is byte-identical to the installed baseline. EXECUTE remains postgres/authenticated, with no public/anon grant. Direct quote writes are denied in the inspected production ACL, so clients cannot invert this order. send_quote_for_business already locks the request before writes.

33/33 expanded transaction checks pass locally: 20 gated different-quote races, 10 same-quote races, 20 cancellation races; payment readiness and existing fee calculation use real unchanged helpers. Includes pending-payment invariants, precommit disconnect rollback, statement timeout, lost-response read recovery, post-wait ownership/request revalidation and unauthorized/stale rejection. No 40P01 in those races.

Actual Live quote/request/dispatch lifecycle triggers are installed in these focused fixtures. CRM, growth, notifications and payout trigger definitions were traced/read from production and their dependencies reviewed, but full-schema replay remains a staging gate. The first expanded cancellation attempt omitted the Live status trigger and failed; that was a fixture omission, corrected by installing the actual trigger, not a production cancellation change.

Client acceptance is single-submit with bounded waits. It reads existing request booking state first and reconciles again after an error, timeout or missing confirmation. A committed booking from either competing quote is recovered; otherwise Check bookings leads to a read, never a mutation replay. Both entry points retain action feedback independently from background reads; Quotes now also uses an immediate ref lock. Eleven recovery unit tests pass.

Next: verify exported screens in Chromium/WebKit, complete catalog/history inventory and rollout rehearsal. Real staging and device acceptance remain blocked. No production DDL or financial calculation change was made.
