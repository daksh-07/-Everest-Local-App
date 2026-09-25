import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const messages=fs.readFileSync('app/messages.tsx','utf8');
const html=fs.readFileSync('app/+html.tsx','utf8');
const haptics=fs.readFileSync('lib/haptics.ts','utf8');
const viewport=fs.readFileSync('lib/visual-viewport.ts','utf8');
const connections=fs.readFileSync('lib/connections.ts','utf8');

test('chat web layout follows the iOS visual viewport rather than fixed 100vh',()=>{
 assert.match(messages,/nativeID="everest-chat-shell"/);
 assert.match(messages,/ChatKeyboardFrame/);
 assert.match(viewport,/window\.visualViewport/);
 assert.match(viewport,/--everest-visual-height/);
 assert.match(html,/100dvh/);
 assert.match(html,/#everest-chat-shell/);
 assert.match(html,/transform: none !important/);
});

test('composer focus reset covers wrapper descendants and RN Web textbox variants',()=>{
 assert.match(html,/#everest-composer-shell \*/);
 assert.match(html,/\[contenteditable="true"\]/);
 assert.match(html,/\[role="textbox"\]/);
 assert.match(html,/outline-style: none !important/);
 assert.match(html,/-webkit-focus-ring-color: transparent !important/);
 assert.match(html,/border-image: none !important/);
});

test('keyboard resizing preserves bottom context only when user is near latest messages',()=>{
 assert.match(messages,/nearBottomRef/);
 assert.match(messages,/contentSize\.height-\(contentOffset\.y\+layoutMeasurement\.height\)<120/);
 assert.match(messages,/Math\.abs\(previous-current\)<32/);
 assert.match(messages,/scrollThreadToEndAfterLayout\(threadRef,!reducedMotion\)/);
});

test('long press measures the selected bubble and uses root modal spotlight geometry',()=>{
 assert.match(messages,/measureInWindow\(\(x,y,width,height\)=>onAction\(message,\{x,y,width,height\}\)\)/);
 assert.match(messages,/type MessageRect=/);
 assert.match(messages,/nativeID="everest-message-action-overlay"/);
 assert.match(messages,/bubbleTop/);
 assert.match(messages,/const groupHeight=reactionHeight/);
 assert.match(messages,/safeBottom/);
 assert.match(messages,/opacity:selected\?\.08/);
});

test('reaction bubble timestamp and actions occupy one ordered non-overlapping spotlight stack',()=>{
 assert.match(messages,/const reactionTop=groupTop/);
 assert.match(messages,/const bubbleTop=groupTop\+\(reactionHeight\?reactionHeight\+gap:0\)/);
 assert.match(messages,/const timestampTop=bubbleTop\+bubbleHeight/);
 assert.match(messages,/const actionTop=timestampTop\+timestampHeight\+gap/);
});

test('message surfaces still suppress Safari text selection only within scoped regions',()=>{
 assert.match(html,/\[data-everest-message-bubble="true"\]/);
 assert.match(html,/-webkit-user-select: none !important/);
 assert.match(html,/-webkit-touch-callout: none !important/);
 assert.match(html,/#everest-message-action-overlay/);
});

test('haptic helper truthfully distinguishes native web vibration and unsupported browsers',()=>{
 assert.match(haptics,/type HapticCapability='native'\|'web-vibration'\|'unsupported'/);
 assert.match(haptics,/typeof navigator\.vibrate==='function'/);
 assert.match(haptics,/Platform\.OS!=='web'/);
 assert.match(haptics,/return 'unsupported'/);
});

test('delete for everyone continues using the hardened v2 RPC',()=>{
 assert.match(connections,/delete_personal_message_for_everyone_v2/);
 assert.match(messages,/result\.placeholder\|\|'You deleted this message'/);
});


test('message thread never dismisses keyboard while composer is active',()=>{
 assert.match(messages,/keyboardShouldPersistTaps="always"/);
 assert.match(messages,/keyboardDismissMode="none"/);
 assert.match(messages,/showSoftInputOnFocus/);
});
