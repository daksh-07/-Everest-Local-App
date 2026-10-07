import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const messages=fs.readFileSync('app/messages.tsx','utf8');
const html=fs.readFileSync('app/+html.tsx','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925124500_final_messaging_delete_everyone_repair.sql','utf8');
const connections=fs.readFileSync('lib/connections.ts','utf8');

test('message composer suppresses browser focus chrome without disabling app-wide accessibility',()=>{
 assert.match(messages,/nativeID="everest-message-composer"/);
 assert.match(messages,/onFocus=\{\(\)=>setFocused\(true\)\}/);
 assert.match(html,/#everest-message-composer:focus-visible/);
 assert.match(html,/outline: none !important/);
 assert.match(html,/-webkit-appearance: none !important/);
 assert.match(html,/box-shadow: none !important/);
 assert.match(html,/-webkit-tap-highlight-color: transparent !important/);
});

test('long press message surface prevents scoped web text selection and opens contextual menu',()=>{
 assert.match(messages,/dataSet:\{everestMessageBubble:'true'\}/);
 assert.match(messages,/onLongPress=\{\(\)=>openAction\(m\)\}/);
 assert.match(html,/\[data-everest-message-bubble="true"\]/);
 assert.match(html,/-webkit-user-select: none !important/);
 assert.match(html,/-webkit-touch-callout: none !important/);
 assert.match(messages,/MessageActionMenu/);
});

test('action UI uses compact reactions and a second delete menu',()=>{
 assert.match(messages,/const cardWidth=Math\.min\(316/);
 assert.match(messages,/DeleteMessageMenu/);
 assert.match(messages,/label:'Delete'/);
 assert.doesNotMatch(messages,/function MessageActionSheet/);
});

test('delete-for-everyone v2 is sender-only and authoritative',()=>{
 assert.match(migration,/delete_personal_message_for_everyone_v2/);
 assert.match(migration,/m\.sender_id=auth\.uid\(\)/);
 assert.match(migration,/c\.user_a=auth\.uid\(\) or c\.user_b=auth\.uid\(\)/);
 assert.match(migration,/delete from public\.personal_message_reactions/);
 assert.match(connections,/delete_personal_message_for_everyone_v2/);
 assert.match(messages,/result\.placeholder/);
});

test('delete choices depend on message ownership',()=>{
 assert.match(messages,/const mine=message\.sender_id===userId/);
 assert.match(messages,/mine&&!message\.deleted_for_everyone/);
 assert.match(messages,/Delete for me/);
 assert.match(messages,/Delete for everyone/);
});

test('composer stays compact and bounded',()=>{
 assert.match(messages,/minHeight:56,maxHeight:132/);
 assert.match(messages,/minHeight:38,maxHeight:102/);
 assert.match(messages,/fontSize:16/);
 assert.match(messages,/borderRadius:29/);
});

test('grouped messages render metadata only at end of cluster',()=>{
 assert.match(messages,/const groupedNext=Boolean/);
 assert.match(messages,/!groupedNext\?<DeliveryMeta/);
 assert.match(messages,/createdAt=\{m\.created_at\}/);
});

test('pending state is subtle contextual metadata instead of shouting',()=>{
 assert.match(messages,/Request pending/);
 assert.doesNotMatch(messages,/>PENDING REQUEST<\/Text>/);
});


test('silent refresh preserves optimistic or failed local messages without forcing list churn',()=>{
 assert.match(messages,/const localPending=current\.filter/);
 assert.match(messages,/m\.id\.startsWith\('temp-'\)\|\|m\.sending\|\|m\.failed/);
 assert.match(messages,/return unchanged\?current:merged/);
});

test('market chat does not yank the reader to the bottom while browsing older messages',()=>{
 assert.match(messages,/const marketNearBottomRef=useRef\(true\)/);
 assert.match(messages,/if\(marketNearBottomRef\.current\)refValue\.current\?\.scrollToEnd/);
});
