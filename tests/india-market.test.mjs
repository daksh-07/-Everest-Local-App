import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const markets=fs.readFileSync(new URL('../lib/markets.ts',import.meta.url),'utf8');
const region=fs.readFileSync(new URL('../lib/market-region.tsx',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../app/index.tsx',import.meta.url),'utf8');
const india=fs.readFileSync(new URL('../components/IndiaHomeScreen.tsx',import.meta.url),'utf8');
const location=fs.readFileSync(new URL('../lib/customer-location.ts',import.meta.url),'utf8');

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
