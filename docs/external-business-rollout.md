# External business discovery: controlled rollout

## Foundation and Phase 2 (local branch only)

`external-discovery` is a disabled-by-default Supabase Edge Function. With `EXTERNAL_BUSINESS_DISCOVERY_ENABLED=true`, the matching database flag, authenticated caller and a server-side `GOOGLE_PLACES_API_KEY`, it requests at most five Australian text-search results using a minimal field mask. No Google content is stored. It retains only permitted Place IDs and Everest-owned reference status. Search results display after native verified businesses with explicit source and non-affiliation labels. Provider failures leave native results usable. An hourly per-user quota limits upstream calls.

Do not enable this flag in production yet. Confirm Google's current display and logo attribution requirements, public terms/privacy disclosures, provider quotas and billing alerts, and add high-confidence deduplication against registered businesses. Search limits prevent trivial client amplification but do not replace provider billing quotas. Place IDs may be retained under Google's documented exemption; names, addresses, reviews and photos must not become a permanent Everest directory sourced from Places. The key must stay in Edge Function secrets. An approved alternative provider can implement the same ephemeral search contract.

## Implemented behind OFF flags

- `external_business_references` is a private provider-ID mapping with `UNLINKED`, `LINK_CANDIDATE`, `LINKED`, `SUPPRESSED`. No fuzzy-name linking occurs.
- `external_enquiries` stores the customer's confirmed first-party request snapshot, approved contact fields, expiry and state. Server RPC checks request ownership, recent provider reference, active state, suppression, three recipients per request, five enquiries per day, 30-day repeat cooldown and duplicate `(request_id, reference_id)`. Customers can read their own enquiry and revoke before a quote.
- `external_quote_responses` is separate from registered `quotes`. Customers see responses and a normal in-app notification. No registered booking, payment, review or dispatch is created.
- An admin with the existing MFA gate must manually validate the recipient before issuing a 256-bit bearer token. Only a SHA-256 hash is stored. The Edge gateway additionally requires `EXTERNAL_QUOTE_GATEWAY_ENABLED=true` and the database gateway flag. The token is one-use, scoped to one enquiry, expires within 72 hours, and supports revocation. Generic failures avoid enumeration. A global 100/minute database gateway request cap limits basic abuse; deployment needs load and abuse review.
- Claim intent and admin approval require an existing verified business, ABN and an independently reviewed control method. Receiving a gateway token never proves ownership. Linking revokes outstanding links and leaves historical responses external.
- Database flags `discovery`, `enquiries`, `gateway`, `messaging`, `claiming` default to false. Environment flags independently protect discovery, enquiries UI and gateway. No automatic email or SMS exists.

## Remaining activation work

1. Run the migration against a disposable PostgreSQL/Supabase project and exercise authenticated RPCs, RLS, token expiry/replay, races, admin MFA and real provider outage cases. Source-level tests do not establish database runtime behavior. Do not apply this migration to production until that passes.
2. Add a verified business recipient/contact binding and a compliant delivery provider. Manual admin validation currently records the claimed channel but cannot independently prove the person receiving a link is the intended business. Do not issue links to real businesses yet.
3. Add durable provider quotas and budget alarms, verify required Google logo/attribution, privacy notices, approved use of business contact data, and dedupe against verified Everest listings. Current dedupe is exact provider ID and admin-reviewed linking only.
4. Build MFA-protected admin views for conflicts, suppression and delivery, plus a formal business self-service opt-out path before any automated outbound operation.
5. The claim RPC exists but there is no self-service claim screen or provider-independent ownership challenge. An admin must independently review ownership evidence before approving.

## Communications boundary

No email/SMS provider or permission basis is configured. Before outbound automation, obtain Australian legal review of whether the exact customer-request notification is a commercial electronic message, its consent basis, required sender identification and opt-out, and how publicly listed business contact information may be used. Separate transactional request content from onboarding offers. Register any branded Australian SMS sender ID where required. Delivery webhooks must be signature verified. A suppressed business must receive no later notifications. Until then, show a customer-initiated call or website action only where the provider permits it, with no claim that Everest sent the request.

## Threats and gates

Provider abuse and spend: server quotas, per-user limits, query bounds, minimal field masks, no broad pagination, budget alerts. PII leakage: selected-field disclosure and customer-only RLS. Forgery and replay: hashed scoped expiring tokens and atomic redemption. Hostile claims: independent proof and manual conflict review. Spam: confirmation, deduplication, recipient caps, suppression and rate limits. Existing native discovery must remain available during every outage.
