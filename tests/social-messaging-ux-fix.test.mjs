import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260925093000_message_request_deletion_followers_fix.sql','utf8');
const messages=fs.readFileSync('app/messages.tsx','utf8');
const connections=fs.readFileSync('lib/connections.ts','utf8');
const search=fs.readFileSync('app/search.tsx','utf8');
const followers=fs.readFileSync('app/business-followers.tsx','utf8');
const businessProfile=fs.readFileSync('app/business-profile.tsx','utf8');

test('outgoing pending message requests stay visible in chats',()=>{
 assert.match(migration,/c\.status='REQUEST' and c\.initiated_by=auth\.uid\(\)/);
 assert.match(messages,/Request pending/);
 assert.match(messages,/selectedPersonal\.status==='ACTIVE'\|\|outgoingRequest/);
});

test('pending requests accept multiple messages in one conversation with rate limiting',()=>{
 assert.doesNotMatch(migration,/Message request already sent/);
 assert.match(migration,/v_recent_count>=10/);
 assert.match(migration,/Too many messages\. Please wait a moment\./);
 assert.match(migration,/select id,status,initiated_by into v_id/);
});

test('delete for me is per-user and delete for everyone is sender-only',()=>{
 assert.match(migration,/create table if not exists public\.personal_message_hidden/);
 assert.match(migration,/user_id=auth\.uid\(\) and h\.message_id=m\.id/);
 assert.match(migration,/m\.sender_id=auth\.uid\(\)/);
 assert.match(migration,/Only the original sender can delete this message for everyone/);
 assert.match(connections,/delete_personal_message_for_me/);
 assert.match(connections,/delete_personal_message_for_everyone/);
 assert.match(messages,/Delete for me/);
 assert.match(messages,/Delete for everyone/);
});

test('ordinary clients cannot read raw deleted personal message content',()=>{
 assert.match(migration,/revoke select on public\.personal_messages from authenticated/);
 assert.match(migration,/create or replace function public\.list_personal_messages/);
 assert.match(migration,/then 'Message deleted' else m\.body/);
 assert.match(connections,/list_personal_messages/);
 assert.doesNotMatch(connections,/from\('personal_messages'\)/);
});

test('blank search does not enumerate people',()=>{
 assert.match(migration,/where \(select t from q\)<>''/);
 assert.match(search,/if\(!text\)\{setLoading\(false\);return\}/);
 assert.match(search,/People only appear when their searchable profile matches your query/);
});

test('business followers are paginated and privacy filtered',()=>{
 assert.match(migration,/create or replace function public\.list_business_followers/);
 assert.match(migration,/limit least\(greatest\(p_limit,1\),50\) offset greatest\(p_offset,0\)/);
 assert.match(migration,/pp\.visibility='PUBLIC'/);
 assert.match(migration,/profile_visibility,'PUBLIC'\)<>'PRIVATE'/);
 assert.match(migration,/not public\.users_blocked\(auth\.uid\(\),pp\.id\)/);
 assert.match(followers,/PAGE_SIZE=25/);
 assert.match(followers,/LOAD MORE/);
 assert.match(followers,/public-user\?id=/);
 assert.match(businessProfile,/business-followers\?businessId=/);
});
