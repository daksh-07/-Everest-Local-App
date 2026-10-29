# Country eligibility and photo recovery — 30 October 2026 (Sydney)

This is an unapplied review candidate, not deployed behavior. Country identity is one eligibility predicate; it does not establish worldwide service, payment, carrier, legal or verification support.

## Implemented in the combined integration follow-up

- Standard and Live matching require same-country local providers before candidate limits; aliases are normalized for Australia, Canada, India, US, UK and New Zealand. Other literal country names must match. Unknown/malformed countries fail closed. Existing capability, radius, availability, authentication and lifecycle predicates remain. Explicit REMOTE services retain their existing rules.
- Opportunity, quote and booking inserts/identity reassignments receive an authoritative country trigger. Existing paid-work status updates are not invalidated; manual legacy work without a request retains its existing authorization contract.
- Product order lines require an active verified accepting merchant with a known origin and a supported product fulfilment method. Delivery/shipping requires an explicit same-country destination. Pickup does not infer the buyer's residence. Cross-border fulfilment is rejected before Stripe creation. Existing order destinations cannot be silently changed after lines exist.
- Checkout captures an editable destination country, focuses missing fields and returns allowlisted public eligibility errors. Product and cart availability reflect missing/paused merchant metadata. Existing amounts remain AUD; no conversion or foreign payment coverage is claimed.
- Request draft metadata remembers only the expected photo count. Recovered forms offer immediate reattachment or an explicit choice to continue without images. Submission waits for that decision. Picker locks and account/route epochs reject stale picker results. No image bytes, local paths or durable public image URLs are saved into client draft storage. Temporary picker URIs are not durable attachments.

## Validation and boundaries

The service SQL suite executes the actual migration against synthetic schemas and reproduces a pre-change wrong-country match for identical locality names. It covers aliases, malformed/missing countries, stale matches, Live radius/availability, write guards, remote capabilities, memberships, private helper ACLs, product methods, cross-border rejection and destination immutability. These fixtures do not prove production RLS or global legal eligibility.

Executable Edge tests verify country rejection precedes Stripe invocation. The cart helper tests execute compiled application code, including allowlisted FunctionsHttpError response handling. Browser fixtures test the actual exported routes without real backend or payment operations.

Secure durable image storage is not implemented. Native force-termination/background picker recovery and physical-device permissions remain unverified. The fallback deliberately avoids storing sensitive photographs in localStorage or an unreviewed public bucket.

Regional/postcode/carrier coverage, delivery-distance enforcement, supported-market legal/verification catalogs, and hosted payment eligibility are not fully validated. Country equality alone must not be described as full marketplace eligibility. No international shipping capability was added.

## Rollout gates

Both the imported phase-4 inventory migration and `20261029145623_marketplace_country_matching_guard.sql` require review and isolated acceptance before a coordinated backend/frontend release. Neither was applied here. Existing pending product checkouts need reconciliation because their destination snapshot may predate country capture. Do not mutate paid orders or infer Stripe session state.

Hosted transaction acceptance remains blocked: no isolated authorized Supabase test project/branch was found, and Stripe account discovery requires reauthentication. Production remains unchanged. Follow the integration review for rollout/rollback and the journey checklist for physical-device acceptance.
