import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('app/+html.tsx','utf8');
const layout=fs.readFileSync('app/_layout.tsx','utf8');
const home=fs.readFileSync('app/index.tsx','utf8');
const tabs=fs.readFileSync('components/CustomerTabBar.tsx','utf8');
const swipe=fs.readFileSync('components/GlobalSwipeNavigator.tsx','utf8');
const quick=fs.readFileSync('lib/quick-actions.ts','utf8');
const weather=fs.readFileSync('lib/weather.ts','utf8');
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
 assert.equal(app.expo.backgroundColor,'#151513');
 assert.equal(app.expo.ios.backgroundColor,'#151513');
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

test('home v3 exposes intent actions and real discovery without gateway-card duplication',()=>{
 assert.match(home,/accessibilityLabel="Request a Quote"/);
 assert.match(home,/Request quotes/);
 assert.match(home,/Need it now\?/);
 assert.match(home,/Search your local area/);
 assert.match(home,/Shop nearby/);
 assert.match(home,/From around Everest/);
 assert.match(home,/RefreshControl/);
 assert.match(home,/signedPostMediaResilient/);
 assert.match(home,/signedProductMediaBatch/);
 assert.match(home,/AmbientEdge/);
 assert.doesNotMatch(home,/OR START HERE/);
 assert.doesNotMatch(home,/label:'Request a Quote'/);
});

test('home renders live weather beside the resolved locality without blocking Home',()=>{
 assert.match(home,/getCurrentWeather/);
 assert.match(home,/weatherIcon/);
 assert.match(home,/weatherInline/);
 assert.match(home,/void loadWeather\(locality\)/);
 assert.doesNotMatch(home,/loadNearby\(locality\),loadWeather\(locality\)/);
 assert.match(weather,/api\.open-meteo\.com\/v1\/forecast/);
 assert.match(weather,/current=temperature_2m,weather_code,is_day/);
 assert.match(weather,/20\*60_000/);
 assert.doesNotMatch(home,/☀️|☁️|🌧️|⛈️/);
});

test('signed-out root does not mount protected business or Live pollers',()=>{
 assert.match(layout,/sessionUserId\?<BusinessOpportunityAlert\/>:null/);
 assert.match(layout,/sessionUserId\?<EverestLiveMiniPlayer\/>:null/);
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


test('primary customer scenes stay mounted and track a single interactive progress value',()=>{
 assert.match(layout,/GlobalSwipeNavigator/);
 assert.match(swipe,/Home[\s\S]*Posts[\s\S]*Clips[\s\S]*My Everest[\s\S]*Messages[\s\S]*Account/);
 assert.match(swipe,/progress\.value=Math\.max\(-\.055/);
 assert.match(swipe,/translateX:-progress\.value\*width/);
 assert.match(swipe,/activeOffsetX\(\[-18,18\]\)/);
 assert.match(swipe,/failOffsetY\(\[-14,14\]\)/);
 assert.match(swipe,/react-native-reanimated/);
 assert.match(swipe,/useReducedMotion/);
 assert.match(swipe,/haptic\.selection\(\)/);
 assert.doesNotMatch(swipe,/SWIPE TO|SKIP TO/);
});


test('bottom navigation derives its indicator and icons from the same page progress',()=>{
 assert.match(tabs,/pager\?\.progress\?\?fallback/);
 assert.match(tabs,/progress\.value<=1\?progress\.value/);
 assert.match(swipe,/router\.replace\(CUSTOMER_PAGES\[target\]/);
});
