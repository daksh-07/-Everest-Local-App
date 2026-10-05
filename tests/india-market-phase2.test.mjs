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
const marketplace=read('lib/marketplace.ts');
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
 assert.match(marketplace,/from\('profiles'\)\.update\(\{country\}\)/);
 assert.match(dispatchIsolation,/update public\.profiles set country=canonical_country/);
});

test('normal matching and Everest Live cannot cross AU and IN provider pools',()=>{
 assert.match(dispatchIsolation,/market_country_key/);
 assert.match(dispatchIsolation,/public\.market_country_key\(coalesce\(nullif\(trim\(b\.country\),''\),'Australia'\)\)=request_market/);
 assert.match(dispatchIsolation,/update public\.opportunities o[\s\S]*status='EXPIRED'[\s\S]*<>request_market/);
 assert.match(dispatchIsolation,/delete from public\.service_matches sm[\s\S]*<>request_market/);
 assert.match(dispatchIsolation,/create or replace function public\.release_everest_live_wave/);
});
