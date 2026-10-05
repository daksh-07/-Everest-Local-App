import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import test from 'node:test';

const markets=fs.readFileSync(new URL('../lib/markets.ts',import.meta.url),'utf8');
const region=fs.readFileSync(new URL('../lib/market-region.tsx',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../app/index.tsx',import.meta.url),'utf8');
const india=fs.readFileSync(new URL('../components/IndiaHomeScreen.tsx',import.meta.url),'utf8');
const location=fs.readFileSync(new URL('../lib/customer-location.ts',import.meta.url),'utf8');
const request=fs.readFileSync(new URL('../app/request.tsx',import.meta.url),'utf8');
const auth=fs.readFileSync(new URL('../app/auth.tsx',import.meta.url),'utf8');

test('India market has INR, +91 and PIN-code primitives',()=>{
 assert.match(markets,/currency:'INR'/);
 assert.match(markets,/phonePrefix:'\+91'/);
 assert.match(markets,/postalLabel:'PIN code'/);
 assert.match(markets,/Asia\/Kolkata/i);
});

test('market selection prefers profile country before device inference',()=>{
 assert.match(region,/select\('country'\)/);
 assert.match(region,/normalizeCountry\(data\?\.country\)\?\?inferred/);
});

test('home shell can render the India-specific customer experience',()=>{
 assert.match(home,/IndiaHomeScreen/);
 assert.match(home,/market\.code==='IN'/);
 assert.match(india,/EVEREST INDIA/);
 assert.match(india,/Get quotes/);
 assert.match(india,/Need someone now\?/);
});

test('web geocoding is not permanently locked to Australia',()=>{
 assert.doesNotMatch(location,/countrycodes:'au'/);
 assert.match(location,/countrycodes/);
});


test('India request flow uses the India address and budget vocabulary',()=>{
 assert.match(request,/Area \/ locality/);
 assert.match(request,/market\.postalLabel/);
 assert.match(request,/market\.currency/);
 assert.match(request,/low: 1000, mid: 2500, high: 5000/);
});

test('authentication can brand the entry experience for India',()=>{
 assert.match(auth,/EVEREST INDIA/);
 assert.match(auth,/India's local marketplace/);
});
