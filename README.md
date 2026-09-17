# Everest Local

Everest Local is a mobile-first local services + local products marketplace built with Expo/React Native and a Supabase/Postgres backend.

## Architecture

- Expo SDK 54 + React Native + Expo Router + TypeScript
- Supabase Auth with mobile session persistence via SecureStore
- Postgres schema with RLS, constraints, indexes and server-side RPCs
- Supabase Edge Functions for trusted checkout, Stripe webhooks and Ask Everest
- Stripe secret keys and AI credentials remain server-side
- No production marketplace seed/fake data is included

## Core marketplace flows

Service: request → deterministic matching → business opportunity → quote → acceptance → messaging → booking → service deposit → completion → review.

Commerce: product → persistent cart → atomic inventory reservation/order → pickup or delivery selection → Stripe Checkout → signed webhook → order fulfilment → Everest Delivery → delivery tracking.

Delivery: ready for pickup → business delivery request → admin driver assignment → pickup → in transit → delivered, with authorized cancellation/failure paths and audit records.

## Configuration

Use `.env.example` as the configuration contract. `EXPO_PUBLIC_*` values are the only values intended for the mobile bundle. Service-role, Stripe secret and AI credentials belong only in the trusted backend/Edge Function environment.

Apply `supabase/migrations/001_*.sql` through the latest numbered migration in order. Deploy the Edge Functions under `supabase/functions/` through Supabase tooling. See `docs/SUPABASE_DEPLOYMENT.md` for the controlled deployment procedure.

## Validation

The GitHub Actions validation workflow runs:

- dependency installation
- TypeScript
- ESLint
- static security/navigation audit
- ordered Supabase migration audit
- security invariant tests
- Expo Doctor
- Expo web export
- Deno type-checking for all Edge Functions

The repository does not currently include a live integration/E2E environment. Real Supabase RLS, PostgreSQL migration execution, Stripe test-mode webhooks, native deep links and external provider behavior must be validated against configured services before production launch.

## Production requirements

1. Configure Supabase Auth and the target database project.
2. Apply all migrations and validate RLS against real Customer/Business/Admin/Driver test accounts.
3. Configure Stripe secret/webhook secrets server-side and register the webhook endpoint.
4. Exercise product and service payment success/failure/expiry/retry scenarios in Stripe test mode.
5. Configure native/web Auth redirect URLs and test password recovery on iOS, Android and web.
6. Configure the AI provider server-side if Ask Everest is enabled.
7. Populate real verified businesses, categories, services and products through controlled workflows.
8. Configure notification/delivery providers if those capabilities are enabled for launch.
9. Build/sign and test the native applications on physical devices.
10. Complete the final launch gate in `docs/FINAL_LAUNCH_GATE.md` before public release.

Never commit secrets or create fake marketplace activity to make the UI appear populated.

## Repository status

The core transactional MVP is implemented at source/CI level: service marketplace, product marketplace, inventory-safe checkout, Stripe architecture, messaging, bookings, reviews, customer/business operations, and Everest Delivery workflow. Production release still depends on real backend/provider/device configuration and live security/transaction testing.
