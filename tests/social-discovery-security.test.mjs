import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260925003000_universal_search_connections_messaging.sql','utf8');
const search=fs.readFileSync('app/search.tsx','utf8');
const social=fs.readFileSync('lib/social.ts','utf8');
const messages=fs.readFileSync('app/messages.tsx','utf8');

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
 assert.match(messages,/MARKETPLACE/);
 assert.match(messages,/REQUESTS/);
});
test('universal search is server-side and external results are separate',()=>{
 assert.match(migration,/create or replace function public\.universal_search/);
 assert.match(search,/universalSearch/);
 assert.match(search,/external-businesses/);
 assert.doesNotMatch(search,/external-discovery/);
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
