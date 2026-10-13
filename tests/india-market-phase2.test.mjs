import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const setup=read('supabase/functions/india-business-setup/index.ts');
const verify=read('supabase/functions/business-india-verify/index.ts');
const scope=read('lib/market-scope.ts');
const currentMarket=read('lib/current-market.ts');
const search=read('lib/universal-search.ts');
const products=read('lib/product-commerce.ts');
const payment=read('lib/payment-provider.ts');
const commerce=read('lib/commerce.ts');
const servicePayments=read('lib/service-payments.ts');
const businessRoute=read('app/business.tsx');
const verificationRoute=read('app/business-verification.tsx');
const payouts=read('app/business-payouts.tsx');
const requestScreen=read('app/request.tsx');
const dispatchIsolation=read('supabase/migrations/20261005144500_india_market_dispatch_isolation.sql');

test('India provider setup never reuses ABN or enables Stripe',()=>{
 assert.match(setup,/p_abn:null/);
 assert.match(setup,/country:'India'/);
 assert.match(setup,/stripe_connect_status:'NOT_CONNECTED'/);
 assert.match(setup,/stripe_charges_enabled:false/);
 assert.match(setup,/stripe_payouts_enabled:false/);
});

test('India verification uses a separate manual provider and optional GSTIN',()=>{
 assert.match(verify,/INDIA_MANUAL/);
 assert.match(verify,/EVIDENCE_SUBMITTED/);
 assert.match(verify,/\^\[0-9A-Z\]\{15\}\$/);
 assert.match(verify,/abn:null/);
 assert.doesNotMatch(verify,/ABR_LOOKUP_GUID/);
});

test('marketplace search and shop are scoped through business country',()=>{
 assert.match(scope,/countryMatchesMarket/);
 assert.match(search,/filterMarketplaceRowsByBusiness/);
 assert.match(products,/filterMarketplaceRowsByBusiness/);
 assert.match(products,/assertBusinessCountryForMarket/);
});

test('India payment rail is modelled as Razorpay Route but remains disabled',()=>{
 assert.match(payment,/provider:'RAZORPAY_ROUTE'/);
 assert.match(payment,/currency:'INR'/);
 assert.match(payment,/enabled:false/);
 assert.match(commerce,/requireMarketplacePayments/);
 assert.match(servicePayments,/requireMarketplacePayments/);
});

test('business onboarding, verification and payouts route away from Australia flows',()=>{
 assert.match(businessRoute,/IndiaBusinessOnboarding/);
 assert.match(verificationRoute,/IndiaBusinessVerification/);
 assert.match(payouts,/business-india-payouts/);
});


test('placeholder Australia profile country does not override an India device before locality is saved',()=>{
 assert.match(currentMarket,/country,suburb,city,state/);
 assert.match(currentMarket,/hasSavedLocality/);
 assert.match(currentMarket,/saved==='AU'&&hasSavedLocality/);
 assert.match(currentMarket,/return inferred/);
});


test('service requests carry the active market before matching',()=>{
 assert.match(requestScreen,/country: effectiveMode === "LOCAL" \? location\.country : market\.countryName/);
 assert.match(dispatchIsolation,/update public\.profiles set country=canonical_country/);
});

test('normal matching and Everest Live cannot cross AU and IN provider pools',()=>{
 assert.match(dispatchIsolation,/market_country_key/);
 assert.match(dispatchIsolation,/public\.market_country_key\(coalesce\(nullif\(trim\(b\.country\),''\),'Australia'\)\)=request_market/);
 assert.match(dispatchIsolation,/update public\.opportunities o[\s\S]*status='EXPIRED'[\s\S]*<>request_market/);
 assert.match(dispatchIsolation,/delete from public\.service_matches sm[\s\S]*<>request_market/);
 assert.match(dispatchIsolation,/create or replace function public\.release_everest_live_wave/);
});


test('product Stripe checkout refuses India or unrecognised seller markets before session reuse',()=>{
 const checkout=read('supabase/functions/checkout/index.ts');
 assert.match(checkout,/const isAustralianStripeBusiness=/);
 assert.match(checkout,/country:\s*string\|null/);
 assert.match(checkout,/\.select\('country,stripe_connected_account_id/);
 assert.match(checkout,/if\(!isAustralianStripeBusiness\(connected\)\)/);
 assert.match(checkout,/release_my_order_reservations/);
 const refusal=checkout.indexOf('if(!isAustralianStripeBusiness(connected))');
 const existing=checkout.indexOf('if(existingPayment?.provider_checkout_session_id)');
 const stripe=checkout.indexOf('const stripe=new Stripe');
 assert.ok(refusal>0&&refusal<existing&&refusal<stripe,'Country check must precede new and reused Stripe sessions');
});

test('service Stripe checkout refuses India sellers and non-AUD payments before session reuse',()=>{
 const checkout=read('supabase/functions/service-checkout/index.ts');
 assert.match(checkout,/const isAustralianStripeBusiness=/);
 assert.match(checkout,/\.select\('country,stripe_connected_account_id/);
 assert.match(checkout,/!isAustralianStripeBusiness\(connected\)/);
 assert.match(checkout,/payment\.currency\.trim\(\)\.toUpperCase\(\)!=='AUD'/);
 const refusal=checkout.indexOf('if(!isAustralianStripeBusiness(connected)');
 const existing=checkout.indexOf('if(payment.provider_checkout_session_id)');
 const stripe=checkout.indexOf('const stripe=new Stripe');
 assert.ok(refusal>0&&refusal<existing&&refusal<stripe,'Market and currency checks must precede new and reused Stripe sessions');
});


test('Stripe Connect account creation stays Australia-only on the server',()=>{
 const source=read('supabase/functions/stripe-connect/index.ts');
 assert.match(source,/\.select\('id,name,description,email,country,status/);
 assert.match(source,/if\(!\['','AU','AUS','AUSTRALIA'\]\.includes\(businessCountry\)\)/);
 assert.ok(source.indexOf('if(![\'\',\'AU\',\'AUS\',\'AUSTRALIA\'].includes(businessCountry))') < source.indexOf('connectedId=await createV2MerchantAccount('));
});

test('membership and package Stripe purchases require an AU seller and AUD even on reuse',()=>{
 const source=read('supabase/functions/membership-billing/index.ts');
 assert.equal((source.match(/\.select\('country'\)\.eq\('id',/g)||[]).length,2);
 assert.match(source,/String\(m\.currency\?\?''\)\.trim\(\)\.toUpperCase\(\)!=='AUD'/);
 assert.match(source,/String\(p\.currency\?\?''\)\.trim\(\)\.toUpperCase\(\)!=='AUD'/);
 const first=source.indexOf('if(marketError||!marketBusiness');
 const second=source.indexOf('if(marketError||!marketBusiness',first+1);
 assert.ok(first>0&&first<source.indexOf('if(m.checkout_session_id)'));
 assert.ok(second>first&&second<source.indexOf('if(p.checkout_session_id)'));
});

test('new Pro subscriptions and post promotions cannot pay through AU rail in India',()=>{
 const pro=read('supabase/functions/business-subscription-billing/index.ts');
 const promo=read('supabase/functions/post-promotion-checkout/index.ts');
 assert.match(pro,/New Everest Pro billing for India is not live yet/);
 assert.ok(pro.indexOf('if(action===\'PORTAL\')')<pro.indexOf('const billingCountry='));
 assert.ok(pro.indexOf('const billingCountry=')<pro.indexOf("if(!priceId)"));
 assert.match(promo,/Post promotions are not yet available for Everest India/);
 assert.match(promo,/\.select\('id,business_id,author_id'\)/);
 assert.ok(promo.indexOf('const country=')<promo.indexOf("userClient.rpc('create_post_promotion'"));
});
