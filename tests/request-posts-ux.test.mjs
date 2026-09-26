import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const request=read('app/request.tsx');
const post=read('app/create-post.tsx');
const quotes=read('app/quotes.tsx');
const leads=read('app/business-leads.tsx');
const migration=read('supabase/migrations/20260925162000_request_posts_matching_ux.sql');
const app=JSON.parse(read('app.json'));
const pkg=JSON.parse(read('package.json'));

test('request UX removes typed date/time and Sydney hardcode',()=>{
 assert.doesNotMatch(request,/YYYY-MM-DD|HH:MM/);
 assert.doesNotMatch(request,/city\s*:\s*['"]Sydney['"]|state\s*:\s*['"]NSW['"]/);
 assert.match(request,/requestForegroundPermissionsAsync/);
 assert.match(request,/reverseGeocodeAsync/);
 assert.match(request,/DateTimeField/);
 assert.match(request,/As soon as possible/);
 assert.match(request,/Morning/);
 assert.match(request,/Afternoon/);
 assert.match(request,/Evening/);
 assert.match(request,/ADD PHOTOS/);
 assert.match(request,/\{step\}\/3/);
});

test('remote requests do not trigger location collection automatically',()=>{
 assert.match(request,/if\s*\(effectiveMode\s*===\s*['"]REMOTE['"]\s*\|\|\s*locating\)\s*return/);
 assert.match(request,/Remote request — no GPS or local address is required/);
});

test('matching is separate from dispatch and bounded to five per wave',()=>{
 assert.match(migration,/release_service_request_wave/);
 assert.match(migration,/least\(coalesce\(p_limit,5\),5\)/);
 assert.match(migration,/matching_wave_count>=3/);
 assert.match(migration,/interval '15 minutes'/);
 assert.doesNotMatch(migration,/service_dispatch_offers|driver_availability|offer_timeout_seconds/);
});

test('request privacy and secure media are server enforced',()=>{
 assert.match(migration,/request-media/);
 assert.match(migration,/service_requests r[\s\S]*r\.customer_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/list_my_business_opportunities/);
 assert.match(migration,/description text,suburb text,city text,state text/);
 assert.doesNotMatch(migration,/returns table\([\s\S]{0,500}latitude/);
});

test('post publishing is real and business identity is server checked',()=>{
 assert.match(post,/PUBLISH POST/);
 assert.match(post,/uploadPostMedia/);
 assert.match(post,/Camera/);
 assert.match(post,/Add photos/);
 assert.match(post,/Choose photos/);
 assert.match(post,/Local note/);
 assert.match(post,/After the job/);
 assert.match(post,/Show your work/);
 assert.match(migration,/publish_post/);
 assert.match(migration,/is_business_member\(p_business_id\)/);
 assert.match(migration,/user_blocks/);
 assert.match(migration,/post-media/);
});

test('customer quote UX is ranked but requires explicit selection',()=>{
 assert.match(quotes,/Best options for you/);
 assert.match(quotes,/slice\(0,3\)/);
 assert.match(quotes,/SEE ALL/);
 assert.match(quotes,/VIEW \/ CHOOSE/);
 assert.match(quotes,/acceptQuote\(id\)/);
 assert.doesNotMatch(quotes,/auto.?accept/i);
});

test('business quote UX stays lightweight and does not fake availability',()=>{
 assert.match(leads,/Quick quote/);
 assert.match(leads,/Timing to confirm/);
 assert.match(leads,/Customer’s preferred time/);
 assert.match(leads,/p_proposed_date/);
});

test('Expo dependencies and permission copy are wired for foreground location and native picker',()=>{
 assert.equal(pkg.dependencies['expo-location'],'~19.0.8');
 assert.equal(pkg.dependencies['@react-native-community/datetimepicker'],'8.4.4');
 const locationPlugin=app.expo.plugins.find((x)=>Array.isArray(x)&&x[0]==='expo-location');
 assert.ok(locationPlugin);
 assert.match(locationPlugin[1].locationWhenInUsePermission,/only when you choose/i);
 assert.equal(locationPlugin[1].locationAlwaysAndWhenInUsePermission,undefined);
});
