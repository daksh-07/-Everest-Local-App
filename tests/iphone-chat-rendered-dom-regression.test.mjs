import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const messages=fs.readFileSync('app/messages.tsx','utf8');
const runtime=fs.readFileSync('lib/chat-web-runtime.ts','utf8');
const viewport=fs.readFileSync('lib/visual-viewport.ts','utf8');
const connections=fs.readFileSync('lib/connections.ts','utf8');

test('rendered textarea receives its own runtime Safari focus reset',()=>{
 assert.match(messages,/installChatWebRuntimeStyles\(c\.brand,c\.text\)/);
 assert.match(runtime,/#everest-message-composer:focus-visible/);
 assert.match(runtime,/outline: none !important/);
 assert.match(runtime,/outline-width: 0 !important/);
 assert.match(runtime,/box-shadow: none !important/);
 assert.match(runtime,/-webkit-appearance: none !important/);
 assert.match(runtime,/font-size: 16px !important/);
});

test('chat root derives usable height directly from visualViewport state',()=>{
 assert.match(viewport,/window\.visualViewport/);
 assert.match(messages,/height:visualViewport\.height/);
 assert.match(messages,/maxHeight:visualViewport\.height/);
 assert.match(messages,/translateY:visualViewport\.offsetTop/);
 assert.match(messages,/keyboardOpen=Platform\.OS==='web'&&visualViewport\.keyboardInset>80/);
});

test('near-bottom anchoring happens after layout rather than hard-coded keyboard padding',()=>{
 assert.match(messages,/contentSize\.height-\(contentOffset\.y\+layoutMeasurement\.height\)<120/);
 assert.match(messages,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(run\)\)/);
 assert.match(messages,/scrollThreadToEndAfterLayout\(threadRef/);
 assert.doesNotMatch(messages,/paddingBottom:\s*400/);
});

test('web message action target uses the actual bubble DOM rectangle',()=>{
 assert.match(messages,/getBoundingClientRect/);
 assert.match(messages,/x:rect\.left,y:rect\.top,width:rect\.width,height:rect\.height/);
 assert.match(messages,/measureInWindow/);
});

test('spotlight reserves a single non-overlapping reaction bubble timestamp action stack',()=>{
 assert.match(messages,/const groupHeight=reactionHeight/);
 assert.match(messages,/const groupTop=Math\.max\(safeTop/);
 assert.match(messages,/const bubbleTop=groupTop\+\(reactionHeight\?reactionHeight\+gap:0\)/);
 assert.match(messages,/const timestampTop=bubbleTop\+bubbleHeight/);
 assert.match(messages,/const actionTop=timestampTop\+timestampHeight\+gap/);
 assert.match(messages,/maxBubbleHeight/);
});

test('message selection suppression is runtime-scoped rather than global',()=>{
 assert.match(runtime,/\[data-everest-message-bubble="true"\]/);
 assert.match(runtime,/-webkit-user-select: none !important/);
 assert.match(runtime,/-webkit-touch-callout: none !important/);
 assert.doesNotMatch(runtime,/body\s*\{[^}]*user-select:\s*none/s);
});

test('delete for everyone stays on the hardened v2 RPC',()=>{
 assert.match(connections,/delete_personal_message_for_everyone_v2/);
 assert.match(messages,/result\.placeholder\|\|'You deleted this message'/);
});
