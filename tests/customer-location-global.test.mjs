/* global AbortController */
import {URL,URLSearchParams} from 'node:url';
import {setTimeout,clearTimeout} from 'node:timers';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual geocoder with platform/network dependencies isolated.
function geocoder(fetch){
 const exports={};
 const source=ts.transpileModule(fs.readFileSync('lib/customer-location.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context=vm.createContext({exports,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch,require(name){
  if(name==='react-native')return {Platform:{OS:'web'}};
  if(name==='expo-location')return {};
  if(name==='./supabase')return {supabase:{}};
  if(name==='./resilience')return {withTimeout:promise=>promise};
  throw new Error(`Unexpected import ${name}`);
 }});
 vm.runInContext(source,context);return exports;
}
for(const [city,country,lat,lon] of [['Toronto','Canada','43.65','-79.38'],['Mumbai','India','19.07','72.87'],['Carlton','Australia','-37.8','144.96']]){
 test(`manual location respects explicit ${country} without Australian restriction`,async()=>{
  let requested;const api=geocoder(async url=>{requested=new URL(url);return {ok:true,json:async()=>[{lat,lon,address:{city,country}}]}});
  const result=await api.geocodeCustomerLocality({city,country});
  assert.equal(requested.searchParams.get('q'),`${city}, ${country}`);
  assert.equal(requested.searchParams.has('countrycodes'),false);
  assert.equal(result.country,country);assert.equal(result.city,city);assert.equal(result.latitude,Number(lat));
 });
}
test('missing country or locality does not send an ambiguous lookup',async()=>{
 let calls=0;const api=geocoder(async()=>{calls++;throw Error('Should not fetch')});
 assert.equal(await api.geocodeCustomerLocality({city:'Richmond'}),null);
 assert.equal(await api.geocodeCustomerLocality({country:'Canada'}),null);assert.equal(calls,0);
});
test('failed lookup remains retryable, successful identical lookup is cached',async()=>{
 let calls=0;const api=geocoder(async()=>{calls++;if(calls===1)throw Error('offline');return {ok:true,json:async()=>[{lat:'49.1',lon:'-123.1',address:{city:'Richmond',country:'Canada'}}]}});
 const input={city:'Richmond',country:'Canada'};
 assert.equal(await api.geocodeCustomerLocality(input),null);
 assert.equal((await api.geocodeCustomerLocality(input)).country,'Canada');
 await api.geocodeCustomerLocality(input);assert.equal(calls,2);
});
test('service address lookup retains caller country and rejects malformed coordinates',async()=>{
 let requested;const api=geocoder(async url=>{requested=new URL(url);return {ok:true,json:async()=>[{lat:'invalid',lon:'-123.1',address:{country:'Canada'}}]}});
 assert.equal(await api.geocodeServiceAddress({addressLine1:'10 Test Street',suburb:'Richmond',city:'Richmond',state:'BC',country:'Canada'}),null);
 assert.match(requested.searchParams.get('q'),/Canada$/);assert.equal(requested.searchParams.has('countrycodes'),false);
});

test('an empty provider response does not poison an immediate retry',async()=>{
 let calls=0;const api=geocoder(async()=>({ok:true,json:async()=>++calls===1?[]:[{lat:'43.65',lon:'-79.38',address:{city:'Toronto',country:'Canada'}}]}));
 const input={city:'Toronto',country:'Canada'};
 assert.equal(await api.geocodeCustomerLocality(input),null);
 assert.equal((await api.geocodeCustomerLocality(input)).city,'Toronto');assert.equal(calls,2);
});
