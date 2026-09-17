# Everest Local

Everest Local is a mobile-first local services + local products marketplace built with Expo/React Native and a Supabase/Postgres backend.

## Architecture

- Expo SDK 53 + React Native + Expo Router + TypeScript
- Supabase Auth with mobile session persistence via SecureStore
- Postgres schema with RLS, constraints, indexes and server-side RPCs
- Supabase Edge Functions for trusted checkout, Stripe webhooks and Ask Everest
- Stripe secret keys remain server-side
- No production marketplace seed/fake data is included

## Marketplace flow

Customer request → deterministic matching → business opportunity → quote → messaging → booking → payment → completion → review.

Commerce flow: product → persistent cart → atomic inventory reservation/order → Stripe Checkout → verified webhook → order status → optional Everest Delivery.

## Configuration

Use `.env.example` as the configuration contract. Never commit secrets. `EXPO_PUBLIC_*` values are the only values intended for the mobile bundle. Service-role, Stripe secret and AI credentials belong only in the trusted backend/Edge Function environment.

Apply migrations in `supabase/migrations/` in order. Deploy the Edge Functions under `supabase/functions/` through Supabase tooling.

## Production requirements

1. Configure Supabase Auth and the target database project.
2. Apply all migrations and validate RLS in the target project.
3. Configure Stripe secret/webhook secrets server-side and register the webhook endpoint.
4. Configure the AI provider endpoint/key server-side before enabling Ask Everest.
5. Configure push/email/SMS providers before enabling those channels.
6. Populate real verified businesses, categories, services and products through controlled workflows. This repository intentionally contains no fake marketplace activity.
7. Run `npm install`, `npm run typecheck`, `npx expo-doctor`, and platform builds in a local/CI environment before release.

## Implemented foundation

The repository contains the mobile customer foundation, authentication UI, real database-backed search, service request submission + deterministic matching, business onboarding, opportunity/quote response, secure lifecycle RPCs, customer orders, participant-scoped messaging, transaction-eligible reviews, persistent cart/checkout services, Stripe checkout/webhook functions, controlled Ask Everest AI, admin authorization/dashboard foundation, and Everest Delivery lifecycle schema.

The application is intentionally not declared production-complete until the target backend is configured and the available CI/device validation passes.
