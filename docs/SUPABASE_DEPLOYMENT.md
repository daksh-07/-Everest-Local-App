# Everest Local — Supabase Deployment & Verification Procedure

This procedure is for the controlled Everest Local Supabase project. It does not create marketplace seed data.

## Current Supabase target

- Project: **Everest Local**
- Region: **ap-southeast-2 (Sydney)**
- Project reference: `bmwbljefnamvjnmuvkvv`
- Project status at connection check: **ACTIVE_HEALTHY**
- Repository: `daksh-07/-Everest-Local-App`
- Migration chain: `001` through `032`, contiguous in the repository
- Remote database at initial inspection: no application migrations/tables applied

The repository now contains `supabase/config.toml` with the target project reference and the existing Edge Function JWT configuration. No migration SQL was rewritten or replaced.

## 1. Preflight

- Confirm the target project is the intended environment.
- Record the project URL and project reference securely.
- Keep the service-role/secret key, Stripe secrets and AI secrets out of the mobile environment.
- Configure Supabase Auth providers and the web/native redirect URLs before recovery testing.
- Ensure the target database is disposable for the first clean migration rehearsal.

## 2. Connect the repository to the Supabase project

The cleanest deployment path for this repository is the Supabase GitHub integration because the repository is private and the migration files must be applied exactly as committed.

In the **Everest Local** Supabase Dashboard:

1. Open **Project Settings → Integrations → GitHub Integration**.
2. Authorize the GitHub account that can read `daksh-07/-Everest-Local-App`.
3. Select repository `daksh-07/-Everest-Local-App`.
4. Set the working directory to `.` because `supabase/` is at the repository root.
5. Select `main` as the production branch and enable production deployment.
6. Do not enable seed data for this production project.

Once enabled, Supabase should read the repository's existing `supabase/migrations/` directory and apply pending migrations in order. The first deployment should therefore apply `001` → `032` to the currently empty application database.

No manual SQL is required for this connection step.

### CLI fallback

If GitHub integration is not used, the equivalent deployment from a trusted machine is:

```bash
supabase login
supabase link --project-ref bmwbljefnamvjnmuvkvv
supabase db push
```

For a clean disposable rehearsal, use the supported remote reset workflow only after confirming the target is the new empty project. Never reset a database containing real production data.

## 3. Migration safety gate

Before deployment, the repository audit must report a contiguous migration sequence and the security invariant suite must pass:

```bash
npm run audit:migrations
npm run test:security
```

The intended chain is `001_marketplace.sql` through `032_cart_authority_hardening.sql`. Do not manually skip, reorder, repair, or mark these migrations as applied without executing their SQL.

The migration set is the existing Everest Local production schema. It includes the marketplace tables, RLS policies, authoritative RPCs, payment/order integrity, delivery operations, notifications, cart concurrency protection, and final cart authority hardening already committed to the repository.

## 4. Deploy Edge Functions

The repository contains these existing functions:

- `account-delete`
- `assistant`
- `checkout`
- `service-checkout`
- `stripe-webhook`
- `stripe-connect`

`supabase/config.toml` keeps JWT verification enabled for authenticated user functions and disables it only for `stripe-webhook`, which authenticates requests using Stripe's webhook signature.

Use the Supabase GitHub integration or the CLI against the same project. Configure only the secrets required by each function in the Supabase Edge Function environment.

Required trusted server configuration is documented in `.env.example`:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CONNECT_WEBHOOK_SECRET` — signing secret for events on connected accounts
- `AI_API_URL`
- `AI_MODEL`
- `AI_API_KEY`

The mobile bundle may contain only the `EXPO_PUBLIC_*` variables. Never put the service-role/secret, Stripe secret or AI key in Expo configuration.

## 5. Auth configuration

Register the exact web callback used by the deployed web environment and the native recovery scheme:

```text
everestlocal://
```

Verify recovery on a physical native build. Source inspection or Expo web export is not evidence of native deep-link success.

## 6. RLS adversarial verification

After the migrations are live, create separate test identities:

- Customer A
- Customer B
- Business A
- Business B
- Admin
- Delivery Driver

Against the deployed database, attempt unauthorized SELECT/INSERT/UPDATE/DELETE/RPC operations across profiles, businesses, services, requests, opportunities, quotes, conversations, messages, bookings, products, carts, orders, payments, reviews, deliveries and notifications.

Expected result: unauthorized requests fail at the database/server authorization boundary even when crafted outside the mobile UI.

Record the exact operation, identity, expected result and actual result. Any unexpected success is a launch blocker and must be fixed before real users transact.

## 7. Stripe test environment

Keep the existing Everest Stripe platform account. Do not create or replace the platform account.

### Marketplace payout model

Everest Local uses Stripe Connect **direct charges** for one-business product orders and service payments. New connected accounts are configured so Stripe bills payment-processing and dispute fees to the connected business account. Everest collects only its marketplace commission through Stripe's `application_fee_amount`. This is the low-overhead launch configuration and avoids the additional Connect platform account/payout fees associated with platform-controlled pricing.

Businesses may create draft services and products before payout onboarding, but the database refuses to activate a paid service or publish a paid product until the business is VERIFIED and Stripe reports both charges and payouts enabled. Bank and identity details are entered in Stripe-hosted onboarding and are never stored in Everest Local.

This direct-charge model is **not escrow**. Funds land in the connected Stripe balance when a payment succeeds. Bank payout timing is governed by the connected account and any Stripe Platform Controls enabled for Everest. If the business later requires platform-held settlement until fulfilment, migrate that flow deliberately to destination charges or separate charges and transfers and re-evaluate the higher platform fee/risk burden first.

Deploy `stripe-connect` and configure `APP_PUBLIC_URL` to the production HTTPS origin. Configure the normal platform webhook secret in `STRIPE_WEBHOOK_SECRET`. Also create a Stripe webhook endpoint for **events on connected accounts** pointing at the same deployed `stripe-webhook` function and store that endpoint's signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`. At minimum subscribe to `account.updated`, Checkout Session payment events, and PaymentIntent success/failure/cancellation events used by Everest.


Execute at minimum:

1. successful product checkout;
2. failed product payment;
3. checkout expiry where applicable;
4. successful service deposit;
5. duplicate webhook delivery;
6. webhook retry after a processing failure;
7. invalid webhook signature;
8. concurrent checkout attempts;
9. cart modification during checkout;
10. insufficient inventory;
11. verified business creates a connected account through Stripe-hosted onboarding;
12. paid service/product publication is blocked before Connect is ready;
13. connected `account.updated` synchronizes charges/payout readiness and pauses listings if Stripe later restricts the account;
14. product direct charge is created on the connected account and Everest receives only the expected application fee;
15. service deposit/balance direct charge uses the booking business connected account;
16. duplicate connected-account webhook delivery remains idempotent;
17. connected-account payment-processing fees are not added to Everest's application fee;
18. payout/bank screen exposes readiness and Everest ledger amounts without exposing bank-account numbers.

Verify database and Stripe state after every scenario. Do not treat a Stripe Dashboard event alone as proof that the database state is correct.

## 8. Production promotion

Only after staging verification passes:

1. provision the production Supabase project;
2. apply the same migration chain from a clean state;
3. deploy the same Edge Function source;
4. configure production-only secrets through the provider secret store;
5. run a minimal authenticated smoke test;
6. create only real, verified marketplace records;
7. retain the migration and transaction evidence for the release record.

Do not copy staging users, fake transactions or test marketplace records into production.

## 9. Evidence required for launch

The following must be attached to the release record:

- migration audit output;
- clean migration deployment result;
- RLS adversarial matrix;
- Stripe transaction matrix;
- native iOS recovery/deep-link result;
- native Android recovery/deep-link result;
- final CI run URL/number;
- provider configuration checklist;
- legal/privacy/support URL verification;
- real marketplace onboarding checklist.

Until this evidence exists, the corresponding launch gates remain **BLOCKED BY HUMAN CONFIGURATION** or **UNVERIFIED** rather than VERIFIED.
