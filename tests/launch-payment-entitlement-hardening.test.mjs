import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const billing=read('supabase/functions/business-subscription-billing/index.ts');
const assistant=read('supabase/functions/assistant/index.ts');
const webhook=read('supabase/functions/stripe-webhook/index.ts');
const ordering=read('supabase/migrations/20260926181500_subscription_webhook_event_ordering.sql');
const calendar=read('app/customer-calendar.tsx');

test('Everest Pro price is deployment configuration, not a source fallback',()=>{
 assert.match(billing,/STRIPE_EVEREST_PRO_PRICE_ID/);
 assert.doesNotMatch(billing,/price_1UJmJzH0LskUiPoKPNbgFbPV/);
});

test('Ask Everest provider usage has server-side Pro enforcement',()=>{
 assert.match(assistant,/hasActiveEverestPro/);
 assert.match(assistant,/business_subscriptions!inner\(status,current_period_end\)/);
 assert.match(assistant,/!proActive \|\| !aiUrl \|\| !aiKey \|\| !model/);
});

test('subscription webhook updates reject stale Stripe events',()=>{
 assert.match(webhook,/p_event_created_at/);
 assert.match(ordering,/last_stripe_event_created_at/);
 assert.match(ordering,/current_event_created_at > p_event_created_at/);
});

test('known-broken Google customer OAuth is unavailable in the release UI',()=>{
 assert.match(calendar,/Temporarily unavailable while Google OAuth configuration is completed/);
 assert.doesNotMatch(calendar,/beginCustomerGoogleCalendarOAuth/);
});
