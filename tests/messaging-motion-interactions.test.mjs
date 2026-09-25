import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const messages=fs.readFileSync('app/messages.tsx','utf8');
const html=fs.readFileSync('app/+html.tsx','utf8');
const connections=fs.readFileSync('lib/connections.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925140000_messaging_conversation_hide.sql','utf8');
const deleteMigration=fs.readFileSync('supabase/migrations/20260925124500_final_messaging_delete_everyone_repair.sql','utf8');
const haptics=fs.readFileSync('lib/haptics.ts','utf8');
const motion=fs.readFileSync('lib/motion.ts','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('composer focus styling targets the actual scoped RN Web DOM path',()=>{
 assert.match(messages,/nativeID="everest-composer-shell"/);
 assert.match(html,/#everest-composer-shell:focus-within/);
 assert.match(html,/#everest-composer-shell \*:focus-visible/);
 assert.match(html,/-webkit-focus-ring-color: transparent !important/);
 assert.match(html,/box-shadow: none !important/);
});

test('haptics are SDK-compatible and safely wrapped',()=>{
 assert.equal(pkg.dependencies['expo-haptics'],'~15.0.8');
 assert.match(haptics,/ImpactFeedbackStyle\.Light/);
 assert.match(haptics,/ImpactFeedbackStyle\.Medium/);
 assert.match(haptics,/NotificationFeedbackType\.Warning/);
 assert.match(haptics,/typeof navigator\.vibrate==='function'/);\n assert.match(haptics,/return 'unsupported'/);
});

test('reduced motion is respected by the reusable motion system',()=>{
 assert.match(motion,/AccessibilityInfo\.isReduceMotionEnabled/);
 assert.match(motion,/reduceMotionChanged/);
 assert.match(messages,/reducedMotion/);
});

test('messages list avatar and chat body have separate navigation targets',()=>{
 assert.match(messages,/onAvatarPress=\{\(\)=>\{if\(row\.kind==='PERSONAL'\)router\.push\('\/public-user\?id='/);
 assert.match(messages,/onPress=\{\(\)=>\{if\(row\.kind==='PERSONAL'\)setSelectedPersonal/);
 assert.match(messages,/accessibilityLabel=\{row\.kind==='PERSONAL'\?'View '\+row\.name\+' profile'/);
});

test('chat header remains wired to the existing public profile route',()=>{
 assert.match(messages,/router\.push\('\/public-user\?id='\+selectedPersonal\.other_user_id\)/);
});

test('conversation long press exposes only implemented actions',()=>{
 assert.match(messages,/setRowMenu\(row\)/);
 assert.match(messages,/ConversationRowMenu/);
 assert.match(messages,/label="Open chat"/);
 assert.match(messages,/label="View profile"/);
 assert.match(messages,/label="Remove from my chats"/);
 assert.match(messages,/label="Block"/);
 assert.match(messages,/label="Report"/);
 assert.doesNotMatch(messages,/label="Mute notifications"/);
});

test('conversation hide is per-user, participant-authorized and reappears after new message',()=>{
 assert.match(migration,/personal_conversation_hidden/);
 assert.match(migration,/user_id=auth\.uid\(\)/);
 assert.match(migration,/c\.user_a=auth\.uid\(\) or c\.user_b=auth\.uid\(\)/);
 assert.match(migration,/lm\.created_at>h\.hidden_at/);
 assert.match(connections,/hide_personal_conversation/);
});

test('delete for everyone remains sender-only and server-sanitized',()=>{
 assert.match(deleteMigration,/m\.sender_id=auth\.uid\(\)/);
 assert.match(connections,/delete_personal_message_for_everyone_v2/);
 assert.match(messages,/result\.placeholder\|\|'You deleted this message'/);
});

test('message and action motion are present but bounded',()=>{
 assert.match(messages,/outputRange:\[\.96,1\]/);
 assert.match(messages,/outputRange:\[mine\?7:-7,0\]/);
 assert.match(messages,/MessageActionMenu/);
 assert.match(messages,/Animated\.spring\(open/);
 assert.match(messages,/transform:\[\{scale:pressed\?1\.13:1\}\]/);
});

test('conversation rows suppress browser selection only within their own scoped surface',()=>{
 assert.match(html,/\[data-everest-conversation-row="true"\]/);
 assert.match(html,/-webkit-touch-callout: none !important/);
});
