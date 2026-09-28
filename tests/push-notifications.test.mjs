import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260928123830_business_push_notifications.sql');
const edge=read('supabase/functions/dispatch-push/index.ts');
const native=read('lib/push-notifications.native.ts');
const layout=read('app/_layout.tsx');
const app=JSON.parse(read('app.json'));
const pkg=JSON.parse(read('package.json'));

test('push tokens are private, auth-bound and RPC managed',()=>{
 assert.match(migration,/create table if not exists public\.device_push_tokens/);
 assert.match(migration,/alter table public\.device_push_tokens enable row level security/);
 assert.match(migration,/revoke all on public\.device_push_tokens,public\.push_delivery_attempts from public,anon,authenticated/);
 assert.match(migration,/function public\.register_my_push_token/);
 assert.match(migration,/v_uid uuid:=auth\.uid\(\)/);
 assert.match(migration,/where user_id=auth\.uid\(\)/);
 assert.match(migration,/grant execute on function public\.register_my_push_token[\s\S]*to authenticated/);
});

test('database push trigger is secret authenticated and disabled until environment setup',()=>{
 assert.match(migration,/create extension if not exists pg_net/);
 assert.match(migration,/gen_random_bytes\(32\)/);
 assert.match(migration,/endpoint text/);
 assert.match(migration,/enabled boolean not null default false/);
 assert.match(migration,/function public\.verify_push_dispatch_secret/);
 assert.match(migration,/grant execute on function public\.verify_push_dispatch_secret\(text\) to service_role/);
 assert.match(migration,/function private\.enqueue_notification_push/);
 assert.match(migration,/net\.http_post/);
 assert.match(migration,/X-Everest-Push-Secret/);
 assert.match(migration,/PUSH_DISPATCH_ENQUEUE_FAILED/);
 assert.doesNotMatch(migration,/bmwbljefnamvjnmuvkvv\.supabase\.co/);
});

test('urgent work notifications are pushed without exposing exact customer address',()=>{
 for(const kind of ['EVEREST_LIVE_REQUEST','SERVICE_DISPATCH_OFFER','NEW_OPPORTUNITY','BOOKING_CONFIRMED']){
  assert.match(migration,new RegExp("'"+kind+"'"));
  assert.match(edge,new RegExp("'"+kind+"'"));
 }
 assert.match(edge,/https:\/\/exp\.host\/--\/api\/v2\/push\/send/);
 assert.match(edge,/priority:urgent\?'high':'default'/);
 assert.match(edge,/sound:urgent\?'default':undefined/);
 assert.match(edge,/channelId:urgent\?'everest-live':'everest-updates'/);
 assert.match(edge,/ttl:urgent\?300:1800/);
 assert.doesNotMatch(edge,/service_requests|address_line|latitude|longitude/i);
 assert.doesNotMatch(edge,/critical/i);
});

test('invalid Expo tokens are retired and delivery attempts are idempotent',()=>{
 assert.match(migration,/unique\(notification_id,push_token_id\)/);
 assert.match(edge,/DeviceNotRegistered/);
 assert.match(edge,/enabled:false/);
 assert.match(edge,/push_delivery_attempts/);
 assert.match(edge,/onConflict:'notification_id,push_token_id'/);
});

test('native business mode registers notification permission and Expo push token',()=>{
 assert.equal(pkg.dependencies['expo-notifications'],'~0.32.17');
 assert.ok(app.expo.plugins.some(p=>Array.isArray(p)&&p[0]==='expo-notifications'));
 assert.match(native,/setNotificationChannelAsync\('everest-live'/);
 assert.match(native,/AndroidImportance\.HIGH/);
 assert.match(native,/requestPermissionsAsync/);
 assert.match(native,/getExpoPushTokenAsync/);
 assert.match(native,/register_my_push_token/);
 assert.match(native,/shouldPlaySound:urgency==='URGENT'/);
});

test('notification taps survive cold launch and signed-out state',()=>{
 assert.match(native,/getLastNotificationResponseAsync/);
 assert.match(native,/addNotificationResponseReceivedListener/);
 assert.match(native,/\/opportunities\?requestId=/);
 assert.match(layout,/getInitialPushHref/);
 assert.match(layout,/subscribeToPushResponses/);
 assert.match(layout,/storePendingQuickActionRoute\(href\)/);
 assert.match(layout,/nav\.replace\('\/auth'\)/);
 assert.match(layout,/pathname\.startsWith\('\/business'\)\|\|pathname==='\/opportunities'/);
});
