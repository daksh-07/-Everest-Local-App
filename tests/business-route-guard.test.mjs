import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout=fs.readFileSync('app/_layout.tsx','utf8');
const appFiles=fs.readdirSync('app').filter(name=>/^business.*\.tsx$/.test(name));
const publicBusinessRoutes=new Set(['business-profile.tsx','business-followers.tsx','business-invite.tsx']);
const routeFor=file=>'/'+file.replace(/\.tsx$/,'');

test('every private business screen participates in the global auth/business route gate',()=>{
 for(const file of appFiles){
  if(publicBusinessRoutes.has(file))continue;
  const route=routeFor(file);
  assert.ok(layout.includes("'"+route+"'")||layout.includes('"'+route+'"'),route+' must be globally gated');
 }
});

test('public business discovery and invitation landing remain intentionally reachable',()=>{
 const start=layout.indexOf('const businessApplicationRoutes');
 const end=layout.indexOf('const adminRoutes');
 const privateSets=layout.slice(start,end);
 for(const route of ['/business-profile','/business-followers','/business-invite']){
  assert.equal(privateSets.includes("'"+route+"'")||privateSets.includes('"'+route+'"'),false,route+' should remain public');
 }
});

test('private business routes require sign-in and verified-business authorization',()=>{
 assert.match(layout,/if\(protectedTarget&&!sessionUserId\)/);
 assert.match(layout,/storePendingQuickActionRoute\(href\)/);
 assert.match(layout,/if\(!sessionUserId\)\{nav\.replace\('\/auth'\)/);
 assert.match(layout,/if\(businessRestrictedRoutes\.has\(pathname\)\)/);
 assert.match(layout,/is_verified_business/);
});
