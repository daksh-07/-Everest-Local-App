# Everest Local — Supabase Deployment & Verification Procedure

This procedure is for a controlled staging/production Supabase project. It does not create marketplace seed data.

## 1. Preflight

- Create a dedicated Supabase project for the intended environment.
- Record the project URL and project reference securely.
- Keep the service-role key, Stripe secrets and AI secrets out of the mobile environment.
- Configure Supabase Auth providers and the web/native redirect URLs before recovery testing.
- Ensure the target database is disposable for the first clean migration rehearsal.

## 2. Apply the migration chain

From a trusted development machine with the Supabase CLI authenticated:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push
```

For a disposable clean database, use the project's supported reset workflow or a fresh project and apply the repository migrations in numeric order from `supabase/migrations/001_*.sql` through the latest migration. Do not manually skip or reorder migrations.

Before deployment, run:

```bash
npm run audit:migrations
npm run test:security
```

The repository audit must report a contiguous migration sequence and the security invariant suite must pass.

## 3. Deploy Edge Functions

Deploy the functions that exist in `supabase/functions/`:

- `account-delete`
- `assistant`
- `checkout`
- `service-checkout`
- `stripe-webhook`

Use the Supabase CLI against the linked project. Configure only the secrets required by each function in the Supabase Edge Function environment.

Required trusted server configuration is documented in `.env.example`:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AI_API_URL`
- `AI_MODEL`
- `AI_API_KEY`

The mobile bundle may contain only the `EXPO_PUBLIC_*` variables. Never put the service-role, Stripe secret or AI key in Expo configuration.

## 4. Auth configuration

Register the exact web callback used by the deployed web environment and the native recovery scheme:

```text
everestlocal://
```

Verify recovery on a physical native build. Source inspection or Expo web export is not evidence of native deep-link success.

## 5. RLS adversarial verification

Create separate test identities:

- Customer A
- Customer B
- Business A
- Business B
- Admin
- Delivery Driver

Against the deployed database, attempt unauthorized SELECT/INSERT/UPDATE/DELETE/RPC operations across profiles, businesses, services, requests, opportunities, quotes, conversations, messages, bookings, products, carts, orders, payments, reviews, deliveries and notifications.

Expected result: unauthorized requests fail at the database/server authorization boundary even when crafted outside the mobile UI.

Record the exact operation, identity, expected result and actual result. Any unexpected success is a launch blocker and must be fixed before real users transact.

## 6. Stripe test environment

Configure Stripe test mode and the deployed `stripe-webhook` endpoint. Set the webhook signing secret in the trusted Edge Function environment.

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
10. insufficient inventory.

Verify database state after every scenario. Do not treat a Stripe Dashboard event alone as proof that the database state is correct.

## 7. Production promotion

Only after staging verification passes:

1. provision the production Supabase project;
2. apply the same migration chain from a clean state;
3. deploy the same Edge Function source;
4. configure production-only secrets through the provider secret store;
5. run a minimal authenticated smoke test;
6. create only real, verified marketplace records;
7. retain the migration and transaction evidence for the release record.

Do not copy staging users, fake transactions or test marketplace records into production.

## 8. Evidence required for launch

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
