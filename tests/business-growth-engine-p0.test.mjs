import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260926203000_business_growth_engine_p0.sql','utf8');
const billing=fs.readFileSync('supabase/functions/membership-billing/index.ts','utf8');
const webhook=fs.readFileSync('supabase/functions/stripe-webhook/index.ts','utf8');
const growth=fs.readFileSync('lib/growth.ts','utf8');
const wallet=fs.readFileSync('app/memberships.tsx','utf8');
const businessGrowth=fs.readFileSync('app/business-growth.tsx','utf8');

test('paid memberships require customer-owned explicit checkout approval',()=>{
 assert.match(migration,/status text not null default 'INVITED'/);
 assert.match(migration,/where id=p_membership_id and customer_id=auth\.uid\(\) for update/);
 assert.match(billing,/action==='START_MEMBERSHIP'/);
 assert.match(billing,/mode:'subscription'/);
 assert.match(wallet,/REVIEW & APPROVE/);
 assert.match(businessGrowth,/This action never charges them/);
 assert.doesNotMatch(migration,/grant (insert|update|delete) on public\.customer_memberships to authenticated/i);
});

test('credit balances are ledger-derived and immutable',()=>{
 assert.match(migration,/create table if not exists public\.service_credit_ledger/);
 assert.match(migration,/Service credit ledger entries are immutable/);
 assert.match(migration,/create trigger service_credit_ledger_immutable_update/);
 assert.match(migration,/create trigger service_credit_ledger_immutable_delete/);
 assert.match(migration,/Only a completed matching booking can redeem credits/);
 assert.match(growth,/service_credit_ledger/);
 assert.doesNotMatch(wallet,/\.update\(['"]service_credit_ledger/);
});

test('Stripe is authoritative for membership lifecycle and package activation',()=>{
 assert.match(webhook,/payment_kind==='business_membership'/);
 assert.match(webhook,/set_customer_membership_from_stripe/);
 assert.match(webhook,/record_membership_invoice/);
 assert.match(webhook,/process_package_checkout_success/);
 assert.match(migration,/grant execute on function public\.set_customer_membership_from_stripe[\s\S]*to service_role/);
 assert.match(migration,/grant execute on function public\.record_membership_invoice[\s\S]*to service_role/);
 assert.doesNotMatch(webhook,/metadata\.payment_kind==='everest_pro'\|\|event\.type\.startsWith\('customer\.subscription\.'/);
});

test('tenant boundaries protect business growth data',()=>{
 for(const table of ['business_membership_plans','customer_memberships','membership_billing_history','business_packages','customer_packages','service_credit_ledger']){
  assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
 }
 assert.match(migration,/public\.is_business_member\(business_id\)/);
 assert.match(migration,/customer_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/not public\.is_business_member\(p_business_id\)/);
});

test('growth metrics are computed from real persisted records',()=>{
 assert.match(migration,/create or replace function public\.get_business_growth_metrics/);
 assert.match(migration,/from public\.customer_memberships where business_id=p_business_id/);
 assert.match(migration,/from public\.membership_billing_history where business_id=p_business_id/);
 assert.match(migration,/from public\.service_credit_ledger where business_id=p_business_id/);
 assert.doesNotMatch(businessGrowth,/fake|mock metric|placeholder metric/i);
});

test('custom customer plans snapshot server-authoritative terms',()=>{
 assert.match(migration,/create_customer_membership_invitation/);
 assert.match(migration,/linked_everest_user_id is null/);
 assert.match(migration,/p_custom_price/);
 assert.match(migration,/billing_interval_unit/);
 assert.match(businessGrowth,/Custom plan/);
 assert.match(growth,/inviteCustomerToMembership/);
});
