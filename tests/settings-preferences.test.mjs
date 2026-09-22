import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration=await readFile('supabase/migrations/20260922173000_settings_preferences_support.sql','utf8');
const preferences=await readFile('lib/preferences.ts','utf8');
const supportFunction=await readFile('supabase/functions/support-email/index.ts','utf8');
const notificationScreen=await readFile('app/notification-settings.tsx','utf8');

test('notification preferences and support tickets are owner scoped',()=>{
 assert.match(migration,/alter table public\.user_notification_preferences enable row level security/i);
 assert.match(migration,/alter table public\.support_requests enable row level security/i);
 assert.match(migration,/support_requests_self_insert[\s\S]{0,220}auth\.uid\(\)\)=user_id/i);
 assert.match(migration,/user_notification_preferences_self_read[\s\S]{0,180}auth\.uid\(\)\)=user_id/i);
 assert.match(migration,/revoke all on public\.user_notification_preferences from public,anon,authenticated/i);
});

test('profile settings update cannot mutate role and limits public identity fields',()=>{
 const rpc=migration.match(/create or replace function public\.update_my_profile_settings[\s\S]*?end;\$\$;/i)?.[0]??'';
 assert.match(rpc,/set search_path to public/i);
 assert.doesNotMatch(rpc,/\brole\s*=/i);
 assert.match(rpc,/p_visibility not in \('PUBLIC','PRIVATE'\)/i);
 assert.match(rpc,/length\(v_bio\)>300/i);
 assert.match(rpc,/display_name=excluded\.display_name[\s\S]*visibility=excluded\.visibility/i);
 assert.match(migration,/grant execute on function public\.update_my_profile_settings[\s\S]*to authenticated/i);
});

test('critical notification classes are not exposed as optional preferences',()=>{
 assert.doesNotMatch(migration,/payment_updates boolean|security_updates boolean|booking_cancellations boolean/i);
 assert.match(notificationScreen,/payment, security and critical cancellation notices remain enabled/i);
});

test('support email is authenticated, idempotent and server-only',()=>{
 assert.match(supportFunction,/userClient\.auth\.getUser\(\)/);
 assert.match(supportFunction,/\.eq\('user_id',user\.id\)/);
 assert.match(supportFunction,/Idempotency-Key.*support-/s);
 assert.match(supportFunction,/Deno\.env\.get\('RESEND_API_KEY'\)/);
 assert.doesNotMatch(preferences,/RESEND_API_KEY|dakshgolani5@gmail\.com/i);
});
