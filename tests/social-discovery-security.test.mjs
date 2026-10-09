import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260925003000_universal_search_connections_messaging.sql','utf8');
const guestSearch=fs.readFileSync('supabase/migrations/20261009082055_guest_marketplace_search.sql','utf8');
const search=fs.readFileSync('app/search.tsx','utf8');
const social=fs.readFileSync('lib/social.ts','utf8');
const messages=fs.readFileSync('app/messages.tsx','utf8');
const rlsHardening=fs.readFileSync('supabase/migrations/20260927133000_social_rls_advisor_hardening.sql','utf8');

test('people use connections while business follow RPC remains separate',()=>{
 assert.match(migration,/create table if not exists public\.user_connections/);
 assert.match(migration,/revoke execute on function public\.follow_user\(uuid\) from authenticated/);
 assert.match(social,/follow_business/);
});
test('connection mutations derive actor from auth uid and prevent self requests',()=>{
 assert.match(migration,/p_recipient=auth\.uid\(\)/);
 assert.match(migration,/requester_id,recipient_id/);
 assert.match(migration,/recipient_id=auth\.uid\(\) and status='PENDING'/);
});
test('blocking suppresses connections, pending requests and personal conversations',()=>{
 assert.match(migration,/delete from public\.user_connections/);
 assert.match(migration,/update public\.user_connection_requests set status='CANCELLED'/);
 assert.match(migration,/update public\.personal_conversations set status='DECLINED'/);
});
test('personal message requests are distinct from marketplace conversations',()=>{
 assert.match(migration,/create table if not exists public\.personal_conversations/);
 assert.match(migration,/status text not null check \(status in \('REQUEST','ACTIVE','DECLINED'\)\)/);
 assert.match(messages,/Business enquiry \/ booking/);
 assert.match(messages,/REQUESTS/);
});
test('universal search is server-side and disabled external discovery is absent from launch search',()=>{
 assert.match(migration,/create or replace function public\.universal_search/);
 assert.match(search,/universalSearch/);
 assert.doesNotMatch(search,/external-businesses/);
 assert.doesNotMatch(search,/external-discovery/);
});
test('guest search exposes verified marketplace listings without people or community results',()=>{
 assert.match(guestSearch,/grant execute on function public\.is_admin\(\) to anon/);
 assert.match(guestSearch,/grant execute on function public\.universal_search\(text,text,int,int\) to anon,authenticated/);
 assert.match(guestSearch,/auth\.uid\(\) is not null or kind in \('BUSINESS','SERVICE','PRODUCT'\)/);
 assert.match(guestSearch,/b\.verification_status='VERIFIED'/);
 assert.match(guestSearch,/s\.active and b\.status='ACTIVE'/);
 assert.match(guestSearch,/grant select\(service_id,instant_booking_enabled\)/);
 assert.match(guestSearch,/service_booking_settings_guest_read[\s\S]*for select to anon/);
});
test('search and profile RPCs suppress blocked users and private discovery',()=>{
 assert.match(migration,/not public\.users_blocked\(auth\.uid\(\),pp\.id\)/);
 assert.match(migration,/sp\.search_visible/);
 assert.match(migration,/profile_visibility/);
});
test('new social tables use RLS and direct writes are revoked',()=>{
 for(const table of ['user_social_preferences','user_connection_requests','user_connections','user_blocks','user_reports','personal_conversations','personal_messages']){
  assert.match(migration,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(migration,new RegExp('revoke all on public\\.'+table));
 }
});

test('social migration uses valid dollar quoting and named universal-search columns',()=>{
 assert.doesNotMatch(migration,/\bas \$\n/);
 assert.doesNotMatch(migration,/end; \$;/);
 assert.match(migration,/'PERSON'::text as kind/);
 assert.match(migration,/as title/);
 assert.match(migration,/as subtitle/);
 assert.match(migration,/as score/);
 assert.match(migration,/as metadata/);
});
test('universal search preserves the existing jobs entry point without client table scans',()=>{
 assert.match(search,/JOB:'JOBS'/);
 assert.match(search,/from\('opportunities'\)/);
 assert.match(search,/from\('service_requests'\)/);
 assert.match(search,/\.ilike\('service_requests\.description',pattern\)/);
 assert.match(search,/\.ilike\('description',pattern\)/);
});


test('followers-only business posts compare against the post business, not the follows row itself',()=>{
 assert.match(rlsHardening,/f\.business_id=posts\.business_id/);
 assert.doesNotMatch(rlsHardening,/f\.business_id=business_id(?:\s|\))/);
 assert.match(rlsHardening,/b\.id=posts\.business_id/);
});

test('post media visibility delegates to the parent post RLS authority',()=>{
 const mediaPolicy=rlsHardening.slice(rlsHardening.indexOf('create policy post_media_visible_read'),rlsHardening.indexOf('-- Avoid two permissive SELECT'));
 assert.match(mediaPolicy,/from public\.posts p/);
 assert.match(mediaPolicy,/p\.id=post_media\.post_id/);
 assert.doesNotMatch(mediaPolicy,/auth\.uid\(\)/);
});

test('availability has one authenticated read policy and separate member writes',()=>{
 assert.match(rlsHardening,/business_availability_public_read_anon/);
 assert.match(rlsHardening,/business_availability_authenticated_read/);
 assert.match(rlsHardening,/business_availability_member_insert/);
 assert.match(rlsHardening,/business_availability_member_update/);
 assert.match(rlsHardening,/business_availability_member_delete/);
 assert.doesNotMatch(rlsHardening,/create policy business_availability_member_write/);
});

test('booking payment summary is not anonymous executable',()=>{
 assert.match(rlsHardening,/revoke all on function public\.service_booking_payment_summary\(uuid\) from public,anon/);
 assert.match(rlsHardening,/grant execute on function public\.service_booking_payment_summary\(uuid\) to authenticated,service_role/);
});
