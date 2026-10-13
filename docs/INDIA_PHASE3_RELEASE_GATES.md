# Everest India — Phase 3: payment boundary and staged release gates

Updated: 2026-10-13

## What this branch delivers

This is an **incremental, draft-only child branch of `feat/india-market-phase2`**. It is not a production launch and must not be merged directly to `main` ahead of the India foundations.

- Product-order Stripe Edge Function reads the seller's business country and rejects non-Australian sellers **before** creating or returning a Stripe Checkout session. Reservation release is attempted when a newly created order cannot proceed.
- Service-payment Stripe Edge Function rejects non-Australian sellers **and** non-AUD payments **before** creating or reusing a Stripe Checkout session. Unstarted pending payment records are marked failed.
- Stripe Connect account onboarding is blocked for India businesses at the Edge Function, not only in the UI.
- Memberships and prepaid packages require an Australian seller **and AUD** before new or reused Stripe sessions.
- New business Pro subscriptions and paid post promotions are blocked for Indian business/profile owners. Existing subscription portal/cancellation access remains available.
- Security-invariant tests cover these Australia-only rails; a dedicated `validate-india-phase3.yml` workflow checks Node regressions, TypeScript, lint, web export and Deno Edge Functions on this isolated branch.
- Null/blank business country remains accepted only for legacy Australian records. **Before India public launch, backfill and explicitly classify every seller country server-side and remove this legacy exception.**
- The existing India Razorpay Route provider config stays disabled. **There is no UPI, payout, refund or settlement implementation in this branch.**

## Why this matters

A screen-level `requireMarketplacePayments()` check is not authorization. Clients can be modified or deep links replayed. Seller market and payment currency must be checked at the authoritative checkout boundary, including when an idempotency key points to an existing session.

## Current market architecture

- AU: AUD and existing Stripe Connect Direct Charges. Existing AU payment behaviour is intended to be preserved; no commission calculation was changed.
- IN: INR-facing customer and business shell; manual business verification; Razorpay Route intended, **not live**.
- Business onboarding, service-matching and Live dispatch isolation exist in Phase 2 but require staging integration tests and migration review.
- Shop and universal-search results are currently filtered by country **after** pagination on the client. This is not a secure, complete or correctly paginated market-specific discovery solution.
- There must be **no implicit INR to AUD conversion** and no cross-country connected-account fallback.

## Next engineering work (in order)

1. **Server-authoritative discovery:** add versioned market-scoped search/shop RPCs with an explicitly validated market code and country predicate **before** `LIMIT/OFFSET`; move business/service/product search and related recommended shelves to those RPCs. Secure anonymous access and don't expose private seller fields. Protect posts/people privacy separately. Keep existing AU queries compatible.
2. **Server-authoritative commerce:** reject cross-market add-to-cart, order creation, service quote/booking and request mutations inside database policies/RPCs. Stamp the market/currency onto immutable order and payment snapshots server-side; do not trust the device locale or client-provided country as payment authority.
3. **Country state UX:** add an explicit, accessible Australia/India market preference with saved location confirmation and a clear empty-state when no local listings are available; do not silently move users between countries when travelling or changing device language.
4. **India providers:** test end-to-end India onboarding, document collection, admin manual review and role separation. Protect KYC material in private storage with owner/reviewer-scoped access and audit logs. Review GSTIN format plus verification requirements with a local professional; don't claim an automated government verification.
5. **Local requests and Live:** India PIN/locality coordinates, remote-vs-local rules, real availability, 45-second UI cadence vs actual offer timeout, provider assignment uniqueness, notifications, quote expiry and cross-market exclusion. Do not display invented counts or ETAs.
6. **Payments behind separate flag:** after documented merchant eligibility and Razorpay Route approval, implement server-created INR orders, signed webhook verification, idempotent reconciliation, merchant KYC/linked accounts, commission splits, refunds, disputes and settlement controls. Keep AU Stripe and IN Razorpay credentials and webhooks isolated. Never enable with frontend-only flags.
7. **India compliance review:** user notices/consents, privacy rights flow, data retention and deletion, grievance/contact information, marketplace seller disclosures, tax invoice handling, refund/cancellation policies, and age-related obligations should be reviewed against applicable law with counsel/accounting before launch.
8. **Beta rollout:** single-city supply-first pilot is preferable to a nationwide empty marketplace. Ahmedabad is a possible pilot location, **not a hard-coded app restriction**. Seed real, permissioned local providers; measure search-to-request, quote coverage, fulfilment and support outcomes.

## Mandatory staging verification

**No launch unless these pass with real staging identities and sandbox accounts:**

| Scenario | Required outcome |
| --- | --- |
| AU customer + AU verified seller, product & service | Existing Stripe test checkout and webhook outcomes unchanged |
| India customer + India seller, product & service | INR UI; payment remains visibly unavailable; no Stripe session |
| AU customer deep-links to India product / uses modified client | Server blocks AU Stripe for India seller; no payment, inventory released |
| India customer deep-links to AU catalogue | App and server enforce intended market scope; no unintended payment |
| India seller missing/invalid verification | Cannot masquerade as AU seller or receive a verified badge |
| India request, ordinary matching + Everest Live | No Australian provider candidate; coordinates and offer timing verified |
| Australia request, ordinary matching + Everest Live | No Indian provider candidate; legacy AU works as designed |
| Search page 2+ with mixed AU/IN results | Country scope occurs before pagination; no empty/duplicate pages |
| Reused idempotency key, session creation retry | Same market/currency checks apply before any stored checkout URL returns |
| Existing AU businesses with empty country | Legacy policy is reviewed, backfilled and removed before broad India release |
| Offline, slow network, 320px viewport, iPhone Safari, Android Chrome | Correct recovery and no broken or misleading payment CTA |
| Data deletion, privacy notice, business abuse report | Verified end-to-end and documented |

## Release/merge sequencing

- Phase 1: PR #93 (India shell, not production).
- Phase 2: PR #94 (cumulative Phase 1 + provider/search/cart isolation, with un-applied migrations).
- Phase 3: child PR of `feat/india-market-phase2` (this branch).
- Marketplace audit PR #97 has overlapping discovery, location and checkout changes; **reconcile deliberately instead of merging blindly**.
- Require green CI, review of SQL privileges/RLS, Edge Function deployment plan, payment/webhook sandbox tests, native-device QA and a rollback plan **before** a production promotion.
- Never apply unapplied India migrations, payment secrets, or Edge Functions automatically through this PR.

## Reference material (verify before release)

- Razorpay Route product architecture: https://razorpay.com/route/
- Razorpay Route settlement/transfers API (amounts in paise, INR): https://razorpay.com/docs/api/payments/route/fetch-transfers-for-a-settlement/
- Government of India DPDP Rules 2025 and enforcement timeline: https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa
- Supabase Data API/RLS guidance: https://supabase.com/docs/guides/api/securing-your-api

This document is an implementation/release checklist, **not legal, tax or payment-provider approval**.
