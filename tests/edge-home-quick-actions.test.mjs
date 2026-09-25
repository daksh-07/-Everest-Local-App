import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('app/+html.tsx','utf8');
const layout=fs.readFileSync('app/_layout.tsx','utf8');
const home=fs.readFileSync('app/index.tsx','utf8');
const tabs=fs.readFileSync('components/CustomerTabBar.tsx','utf8');
const quick=fs.readFileSync('lib/quick-actions.ts','utf8');
const manifest=JSON.parse(fs.readFileSync('public/manifest.json','utf8'));
const app=JSON.parse(fs.readFileSync('app.json','utf8'));

test('web shell is full bleed without the old standalone safe-area strip',()=>{
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/min-height: 100dvh/);
 assert.doesNotMatch(html,/body::before/);
 assert.match(html,/#root[\s\S]*min-height: 100dvh/);
});

test('native status bar blends into the edge-to-edge root',()=>{
 assert.match(layout,/translucent backgroundColor="transparent"/);
 assert.equal(app.expo.backgroundColor,'#0b0b0b');
 assert.equal(app.expo.ios.backgroundColor,'#0b0b0b');
});

test('home uses contextual real-data sections rather than fabricated metrics',()=>{
 assert.match(home,/Good afternoon|greeting\(\)/);
 assert.match(home,/notifications/);
 assert.match(home,/service_requests/);
 assert.match(home,/bookings/);
 assert.match(home,/businesses/);
 assert.match(home,/listPublicPosts/);
 assert.doesNotMatch(home,/trending score|fake distance|popular now/i);
});

test('home exposes the four core product actions and universal search',()=>{
 for(const label of ['Request a Quote','Find Services','Shop Local','Ask Everest'])assert.match(home,new RegExp(label));
 assert.match(home,/Search people, services, businesses/);
});

test('bottom navigation respects safe area and provides native haptic selection',()=>{
 assert.match(tabs,/useSafeAreaInsets/);
 assert.match(tabs,/haptic\.selection/);
});

test('native quick actions use four iOS-safe routes and preserve auth continuation',()=>{
 assert.match(quick,/Request Quote/);
 assert.match(quick,/Messages/);
 assert.match(quick,/Search/);
 assert.match(quick,/Ask Everest/);
 assert.match(quick,/PENDING_QUICK_ACTION_KEY/);
 assert.match(layout,/QuickActions\.initial/);
 assert.match(layout,/QuickActions\.addListener/);
});

test('manifest shortcuts are progressive enhancement only',()=>{
 assert.equal(manifest.shortcuts.length,4);
 assert.deepEqual(manifest.shortcuts.map(x=>x.url),['/request','/messages','/search','/assistant']);
});
