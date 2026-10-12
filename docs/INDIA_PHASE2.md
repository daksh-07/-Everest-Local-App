# Everest India — Phase 2 handoff

Phase 2 extends the Phase 1 market shell into provider and marketplace infrastructure.

## Implemented
- India-only business onboarding and India manual verification.
- Optional GSTIN capture without reusing ABN fields.
- India payout-provider abstraction with Razorpay Route as the intended rail, disabled until production onboarding exists.
- Country scoping for universal marketplace search, shop results, product detail and cart contents.
- India checkout blocks for product and service payments until the India rail is enabled.
- INR formatting across shop, product and cart surfaces.
- India providers are redirected away from Stripe Connect payout onboarding.

## Operational gates before India payments can go live
1. Complete Razorpay/Route commercial onboarding and production credentials.
2. Define linked-account KYC requirements and provider consent language.
3. Add signed webhook handling and reconciliation.
4. Add India tax/GST invoice policy after legal/accounting review.
5. Move market filtering into database RPCs as a server-side defense-in-depth layer before broad public launch.

No production Supabase schema changes or live India payment credentials are introduced by this phase.
