import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260926231500_marketplace_fee_engine.sql')+'\n'+read('supabase/migrations/20260929133200_flat_marketplace_fee_policy_v2.sql');
const serviceCheckout=read('supabase/functions/service-checkout/index.ts');
const productCheckout=read('supabase/functions/checkout/index.ts');

function serviceFee(amount){
 const gross=Math.max(0,amount);
 if(gross<=0)return 0;
 const fee=gross<200?Math.min(gross,Math.max(5,gross*.05)):gross<=500?gross*.05:gross<=1000?gross*.035:gross*.028;
 return Math.round((fee+Number.EPSILON)*100)/100;
}

test('service fee schedule uses the approved flat launch bands',()=>{
 assert.equal(serviceFee(50),5);
 assert.equal(serviceFee(100),5);
 assert.equal(serviceFee(150),7.5);
 assert.equal(serviceFee(199.99),10);
 assert.equal(serviceFee(200),10);
 assert.equal(serviceFee(500),25);
 assert.equal(serviceFee(500.01),17.5);
 assert.equal(serviceFee(750),26.25);
 assert.equal(serviceFee(1000),35);
 assert.equal(serviceFee(1000.01),28);
 assert.equal(serviceFee(1500),42);
 assert.equal(serviceFee(5000),140);
 assert.match(migration,/2026-09-v2/);
});

test('database owns fee calculations and payout ledger',()=>{
 assert.match(migration,/calculate_service_platform_fee/);
 assert.match(migration,/calculate_product_platform_fee/);
 assert.match(migration,/marketplace_payout_ledger/);
 assert.match(migration,/stripe_connected_account_id/);
 assert.match(migration,/fee_policy_version/);
});

test('product fee is five percent of product subtotal and excludes delivery',()=>{
 assert.match(migration,/round\(p_subtotal\*0\.05,2\)/);
 assert.match(migration,/new\.marketplace_fee:=public\.calculate_product_platform_fee\(new\.subtotal\)/);
});

test('Stripe checkout metadata snapshots immutable fee values',()=>{
 for(const source of [serviceCheckout,productCheckout]){
  assert.match(source,/everest_fee/);
  assert.match(source,/provider_net/);
  assert.match(source,/fee_policy_version/);
 }
});
