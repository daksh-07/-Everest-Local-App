# Isolated acceptance migration review

Review input: `20261019081535_phase7_quote_acceptance_lock_order.sql`. This review is scoped to acceptance concurrency; independent reviewer sign-off and real staging are still required.

## Changed block only

- Previous: quote FOR UPDATE → shared request FOR UPDATE → accepted quote update → competing quote updates.
- New: unlocked quote/owner lookup → shared request FOR UPDATE → selected quote FOR UPDATE → revalidate owner AND request identity → unchanged remainder.
- The first lookup determines which request to lock. It is not trusted after waiting. A missing/moved quote, changed customer or changed request fails before mutations.
- No new function, parameters, table, index, writable policy, public privilege or financial setting. The function retains SECURITY DEFINER, its existing search path, owner and authenticated-only EXECUTE. All object references in the body remain explicitly qualified.
- Regression compares the entire suffix starting at the QUOTING check byte for byte against the installed production baseline. The fee/deposit calculation, expiry checks, payment readiness, declined alternatives, PENDING_PAYMENT/marketplace_payment_required booking, BOOKED request and notification are unchanged.

## Execution path and lock dependencies

`Live.choose` / `Quotes.accept` → `marketplace.acceptQuote` → single `accept_quote` RPC. Client preflight/reconciliation uses existing customer-scoped quote/booking SELECT under RLS; it cannot authorize the write. Failed preflight submits no mutation; uncertain mutation is never automatically replayed.

Inside SQL: authenticate → request lock → selected quote lock/revalidation → unchanged state/expiry/readiness/fee guards → update quote and competing quotes → booking insert → request BOOKED → notification. Real fee and readiness helpers are read-only and unchanged.

Traced production triggers:

| Trigger path | Effect / locks |
| --- | --- |
| quotes_crm_sync | Existing business/request CRM opportunity update and activity append |
| quotes_notify | Notification append |
| everest_live_quote_response | Opportunity and shared request update; caller already holds request |
| bookings_crm_sync | Existing CRM opportunity update and activity append |
| bookings_notify | Notification append |
| growth_booking_completed | Completion-only path; new booking remains PENDING_PAYMENT |
| update_service_payout_release_state | UPDATE-of-status trigger, not booking insert; settlement unchanged |
| sync_everest_live_request_lifecycle | Sets Live BOOKED with request BOOKED, preventing later Live cancellation |
| cancel_service_dispatch_on_marketplace_change | Existing dispatch job lock/lifecycle guard on request/booking status change |

`send_quote_for_business` already locks request before opportunity/quote writes. The inspected production quote ACL permits authenticated SELECT only, with no direct INSERT/UPDATE/DELETE policy; ordinary clients cannot lock competing quote rows before the authoritative RPC. Operator SQL and independent CRM/dispatch/payment mutations must still follow reviewed lock contracts. The focused suite does not establish a global lock-order proof across the entire production schema.

The controlled suite includes the actual Live request, quote and dispatch lifecycle triggers and unchanged readiness/fee helpers. CRM, notification, growth and payout definitions were traced/catalogued, but their complete schema and cross-feature trigger graph require staging replay; they are not silently mocked as complete production validation.

## Evidence and decision

Before: 40P01 with 12 passing contracts and one failed no-deadlock assertion. After: 35/35 transaction checks, including 20 gated distinct-quote, 10 same-quote and 20 cancellation races; zero deadlocks and at most one booking. Timeout and precommit disconnect rollback, lost-response read recovery, stale/unauthorized decisions, readiness and fee/pending-payment invariants pass. Focused rollback/reapply restores the exact old definition and original execution ACL, then reapplies the new definition without changing rows.

**Local source review: PASS within this scope. Independent approval and actual staging: BLOCKED. Production application: NOT AUTHORIZED by these tests.** Do not change Stripe configuration, fee amounts, commission or settlement to make acceptance tests pass.
