import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260927081523_stripe_connect_marketplace_payouts.sql','utf8');
const connect=fs.readFileSync('supabase/functions/stripe-connect/index.ts','utf8');
const checkout=fs.readFileSync('supabase/functions/checkout/index.ts','utf8');
const serviceCheckout=fs.readFileSync('supabase/functions/service-checkout/index.ts','utf8');
const webhook=fs.readFileSync('supabase/functions/stripe-webhook/index.ts','utf8');
const payouts=fs.readFileSync('app/business-payouts.tsx','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const env=fs.readFileSync('.env.example','utf8');

test('paid listings are server-gated on verified Connect payout readiness',()=>{
 assert.match(migration,/is_business_payment_ready/);
 assert.match(migration,/stripe_connect_status='ACTIVE'/);
 assert.match(migration,/stripe_charges_enabled/);
 assert.match(migration,/stripe_payouts_enabled/);
 assert.match(migration,/set up Stripe payouts before activating paid services/i);
 assert.match(migration,/set up Stripe payouts before publishing paid products/i);
});

test('connected accounts use Stripe-paid fee collection for the low-overhead direct charge model',()=>{
 assert.match(connect,/fees:\{payer:'account'\}/);
 assert.match(connect,/losses:\{payments:'stripe'\}/);
 assert.match(connect,/requirement_collection:'stripe'/);
 assert.match(connect,/stripe_dashboard:\{type:'full'\}/);
 assert.match(connect,/card_payments:\{requested:true\}/);
 assert.match(connect,/transfers:\{requested:true\}/);
});

test('product and service checkouts are direct connected-account charges with Everest application fees',()=>{
 for(const source of [checkout,serviceCheckout]){
  assert.match(source,/application_fee_amount/);
  assert.match(source,/stripeAccount:connectedId/);
  assert.match(source,/stripe_charge_model:'DIRECT'/);
  assert.match(source,/stripe_fee_payer:'CONNECTED_ACCOUNT'/);
  assert.match(source,/stripe_application_fee/);
 }
 assert.match(checkout,/This business is still setting up payouts/);
 assert.match(serviceCheckout,/This business is still setting up payouts/);
});

test('connected account events synchronize readiness and settle the direct-charge ledger',()=>{
 assert.match(webhook,/STRIPE_CONNECT_WEBHOOK_SECRET/);
 assert.match(webhook,/event\.type==='account\.updated'/);
 assert.match(webhook,/stripe_connect_status/);
 assert.match(webhook,/status:'DIRECT_SETTLED'/);
 assert.match(webhook,/connected_account_id:connectedAccountId/);
});

test('bank details stay in Stripe-hosted onboarding, not Everest UI or environment',()=>{
 assert.match(connect,/stripe\.accountLinks\.create/);
 assert.match(connect,/type:'account_onboarding'/);
 assert.match(payouts,/Everest does not store your bank details/);
 assert.doesNotMatch(payouts,/account_number|routing_number|bsb_number|bank_account_number/i);
 assert.doesNotMatch(env,/BANK_ACCOUNT_NUMBER|BANK_BSB/);
});

test('Stripe Connect function and webhook secret are configured explicitly',()=>{
 assert.match(config,/\[functions\.stripe-connect\]\s*verify_jwt = true/);
 assert.match(env,/STRIPE_CONNECT_WEBHOOK_SECRET=/);
 assert.match(env,/APP_PUBLIC_URL=/);
});
