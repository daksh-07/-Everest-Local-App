import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260925214500_crm_integrations_automation_foundation.sql');
const oauth=read('supabase/functions/crm-integration-oauth/index.ts');
const calendarSync=read('supabase/functions/crm-calendar-sync/index.ts');
const client=read('lib/integrations.ts');
const hub=read('app/business-integrations.tsx');
const automations=read('app/business-automations.tsx');

test('integration records and provider credentials have separate security boundaries',()=>{
 assert.match(migration,/create table public\.integration_connections/);
 assert.match(migration,/create table public\.integration_oauth_credentials/);
 assert.match(migration,/revoke all on public\.integration_oauth_credentials from public,anon,authenticated/);
 assert.doesNotMatch(client,/access_token|refresh_token|token_ciphertext|token_iv/);
 assert.match(oauth,/INTEGRATION_TOKEN_ENCRYPTION_KEY/);
 assert.match(oauth,/AES-GCM/);
 assert.match(oauth,/secret_reference:'integration_oauth_credentials\/'/);
});

test('OAuth uses authenticated membership for initiation and signed expiring callback state',()=>{
 assert.match(oauth,/userClient\.auth\.getUser\(\)/);
 assert.match(oauth,/\.from\('business_members'\).*\.eq\('business_id',businessId\).*\.eq\('user_id',user\.id\)/s);
 assert.match(oauth,/HMAC/);
 assert.match(oauth,/state\.exp>Date\.now\(\)/);
 assert.match(oauth,/Business access is no longer available/);
 assert.doesNotMatch(oauth,/console\.log\(.*token/i);
});

test('calendar events stay external and opaque busy blocks prevent CRM double booking',()=>{
 assert.match(migration,/create table public\.external_calendar_busy_blocks/);
 assert.match(migration,/privacy text not null default 'OPAQUE'/);
 assert.match(migration,/privacy='DETAILS_ALLOWED' or safe_label='Busy'/);
 assert.match(migration,/reject_external_calendar_conflict/);
 assert.match(migration,/Booking conflicts with an external calendar busy time/);
 assert.match(migration,/num_nonnulls\(marketplace_booking_id,crm_booking_id,crm_task_id\) <= 1/);
 assert.match(calendarSync,/privacy:'OPAQUE',safe_label:'Busy'/);
 assert.match(calendarSync,/extendedProperties:\{private:\{everest_crm_booking_id:booking\.id\}\}/);
 assert.match(calendarSync,/last_synced_at/);
 assert.match(calendarSync,/Calendar authorization expired\. Reconnect it/);
});

test('automation foundation is tenant scoped, idempotent and limited to safe actions',()=>{
 for(const table of ['crm_automations','crm_automation_conditions','crm_automation_actions','crm_automation_runs'])assert.match(migration,new RegExp("'"+table+"'"));
 assert.match(migration,/unique \(business_id,automation_id,event_key\)/);
 assert.match(migration,/public\.is_business_member\(business_id\)/);
 assert.match(migration,/CREATE_TASK','ADD_TAG','REMOVE_TAG','UPDATE_DEAL_STAGE','CREATE_INTERNAL_NOTE','CREATE_NOTIFICATION','CREATE_FOLLOW_UP','CALL_WEBHOOK/);
 assert.doesNotMatch(migration,/SEND_EMAIL|SEND_SMS|DELETE_CONTACT/);
 assert.match(automations,/This starts as a draft/);
});

test('webhook foundation requires HTTPS, secret references, delivery attempts and replay-safe event keys',()=>{
 assert.match(migration,/endpoint_url ~ '\^https:\/\/'/);
 assert.match(migration,/signing_secret_reference text not null/);
 assert.match(migration,/unique \(webhook_id,event_id,attempt\)/);
 assert.match(migration,/next_attempt_at timestamptz/);
});

test('integrations hub never presents unavailable AI or missing OAuth configuration as connected',()=>{
 for(const provider of ['GOOGLE_CALENDAR','MICROSOFT_CALENDAR','GMAIL','OPENAI'])assert.match(hub,new RegExp(provider));
 assert.match(hub,/SET UP SERVER/);
 assert.match(client,/Provider OAuth credentials are not configured|This integration is not configured/);
 assert.match(hub,/OAuth tokens stay on the server/);
});
