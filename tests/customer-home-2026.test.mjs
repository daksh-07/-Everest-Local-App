import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('app/index.tsx','utf8');
const assistant=fs.readFileSync('app/assistant.tsx','utf8');
const request=fs.readFileSync('app/request.tsx','utf8');
const floating=fs.readFileSync('components/DraggableAskEverest.tsx','utf8');

test('customer Home is intent-first rather than feature-card-first',()=>{
 assert.match(home,/What do you need today\?/);
 assert.match(home,/Describe what you need/);
 assert.doesNotMatch(home,/Local, when you need it\./);
 assert.doesNotMatch(home,/Choose how to start/);
 assert.doesNotMatch(home,/BROWSING AREA/);
});

test('Home reuses existing search request assistant and customer navigation',()=>{
 assert.match(home,/\/search\?q=/);
 assert.match(home,/\/request/);
 assert.match(home,/\/assistant\?prompt=/);
 assert.match(home,/CustomerTabBar active="\/"/);
 assert.match(home,/tab=SERVICE/);
 assert.match(home,/tab=PRODUCT/);
});

test('Home only renders live marketplace state for activity businesses and community',()=>{
 assert.match(home,/from\('service_requests'\)/);
 assert.match(home,/from\('quotes'\)/);
 assert.match(home,/from\('bookings'\)/);
 assert.match(home,/from\('orders'\)/);
 assert.match(home,/verification_status','VERIFIED/);
 assert.match(home,/listPublicPosts\(\{limit:4\}\)/);
 assert.doesNotMatch(home,/Math\.random/);
});

test('external businesses stay out of Home discovery',()=>{
 assert.doesNotMatch(home,/external-business/);
});

test('Ask Everest and quote request accept intent handoff',()=>{
 assert.match(assistant,/useLocalSearchParams<\{prompt\?:string\}>/);
 assert.match(assistant,/void ask\(initialPrompt\)/);
 assert.match(request,/description\?:string/);
 assert.match(request,/initialDescription/);
 assert.match(floating,/\['\/', '\/assistant'/);
});

test('Home keeps compact customer navigation hierarchy and real trust signals',()=>{
 assert.match(home,/GET QUOTES/);
 assert.match(home,/BOOK A SERVICE/);
 assert.match(home,/SHOP LOCAL/);
 assert.match(home,/ASK EVEREST/);
 assert.match(home,/AROUND EVEREST/);
 assert.match(home,/BROWSE CATEGORIES/);
 assert.match(home,/reviewCount/);
 assert.match(home,/Verified/);
});
