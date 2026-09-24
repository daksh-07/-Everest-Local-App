import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260925113000_production_messaging_overhaul.sql','utf8');
const messages=fs.readFileSync('app/messages.tsx','utf8');
const connections=fs.readFileSync('lib/connections.ts','utf8');

test('personal message pagination remains participant scoped and hidden-message aware',()=>{
 assert.match(migration,/create or replace function public\.list_personal_messages_v2/);
 assert.match(migration,/c\.user_a=auth\.uid\(\) or c\.user_b=auth\.uid\(\)/);
 assert.match(migration,/personal_message_hidden h/);
 assert.match(migration,/limit least\(greatest\(p_limit,1\),80\)/);
 assert.match(connections,/list_personal_messages_v2/);
});

test('reply references stay inside the same conversation',()=>{
 assert.match(migration,/reply_to_message_id uuid references public\.personal_messages/);
 assert.match(migration,/rm\.id=p_reply_to and rm\.conversation_id=v_conversation/);
 assert.match(messages,/REPLYING/);
 assert.match(messages,/reply_preview/);
});

test('reactions are participant-only and one reaction per user per message',()=>{
 assert.match(migration,/primary key\(message_id,user_id\)/);
 assert.match(migration,/toggle_personal_message_reaction/);
 assert.match(migration,/m\.deleted_for_everyone_at is null/);
 assert.match(migration,/user_id=auth\.uid\(\)/);
 assert.match(messages,/REACTIONS/);
});

test('editing is sender-only with audit history and a finite window',()=>{
 assert.match(migration,/personal_message_edit_history/);
 assert.match(migration,/m\.sender_id=auth\.uid\(\)/);
 assert.match(migration,/m\.created_at>now\(\)-interval '15 minutes'/);
 assert.match(migration,/previous_body,next_body/);
 assert.match(messages,/EDITING MESSAGE/);
});

test('read state and unread summary are based on persisted read_at',()=>{
 assert.match(migration,/mark_personal_conversation_read/);
 assert.match(migration,/um\.sender_id<>auth\.uid\(\) and um\.read_at is null/);
 assert.match(messages,/m\.read_at\?'Seen':'Sent'/);
 assert.match(messages,/unread_count/);
});

test('message destructive actions are contextual, not rendered below every bubble',()=>{
 assert.match(messages,/onLongPress=\{\(\)=>onAction\(m\)\}/);
 assert.match(messages,/MessageActionSheet/);
 assert.doesNotMatch(messages,/marginTop:4\}[\s\S]*DELETE FOR ME[\s\S]*DELETE FOR EVERYONE[\s\S]*<\/View>\s*<\/View>\s*;\s*}\s*}\s*<\/ScrollView>/);
});

test('pending requests remain sender-visible and duplicate conversation prevention remains database-backed',()=>{
 assert.match(migration,/select id,status,initiated_by into v_conversation/);
 assert.match(migration,/where \(user_a=auth\.uid\(\) and user_b=p_recipient\) or \(user_a=p_recipient and user_b=auth\.uid\(\)\)/);
 assert.match(messages,/outgoingRequest/);
 assert.match(messages,/Request pending/);
});

test('client uses optimistic send and does not refresh the whole thread before showing outgoing text',()=>{
 assert.match(messages,/const optimistic:PersonalMessage/);
 assert.match(messages,/setPersonalThread\(current=>\[\.\.\.current,optimistic\]\)/);
 assert.match(messages,/Sending/);
 assert.match(messages,/Failed · tap to retry/);
});

test('attachments are intentionally not exposed without a secure chat media boundary',()=>{
 assert.doesNotMatch(messages,/attachment/i);
 assert.doesNotMatch(messages,/camera-outline/);
});
