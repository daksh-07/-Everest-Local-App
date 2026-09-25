import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260926020000_customer_calendar_integrations.sql');
const oauth=read('supabase/functions/customer-calendar-oauth/index.ts');
const sync=read('supabase/functions/customer-calendar-sync/index.ts');
const device=read('lib/device-calendar.native.ts');
const client=read('lib/customer-calendar.ts');
const screen=read('app/customer-calendar.tsx');
const settings=read('app/settings.tsx');
const assistant=read('supabase/functions/assistant/index.ts');
const assistantUi=read('app/assistant.tsx');
const appConfig=read('app.json');
const pkg=read('package.json');

test('customer calendar data is owner-scoped and OAuth credentials are not client-readable',()=>{
 assert.match(migration,/create table public\.customer_calendar_connections/);
 assert.match(migration,/create table public\.customer_calendar_oauth_credentials/);
 assert.match(migration,/revoke all on public\.customer_calendar_oauth_credentials from public, anon, authenticated/);
 assert.match(migration,/using \(\(select auth\.uid\(\)\) = user_id\)/);
 assert.match(migration,/with check \(\(select auth\.uid\(\)\) = user_id\)/);
 assert.match(migration,/unique \(id, user_id\)/);
 assert.doesNotMatch(client,/access_token|refresh_token|token_ciphertext|token_iv/);
});

test('calendar privacy boundary stores only opaque busy windows',()=>{
 assert.match(migration,/privacy text not null default 'OPAQUE' check \(privacy = 'OPAQUE'\)/);
 assert.match(migration,/safe_label text not null default 'Busy' check \(safe_label = 'Busy'\)/);
 assert.match(device,/externalEventId:.*startsAt,endsAt,updatedAt/);
 assert.doesNotMatch(client,/\.title|\.location|\.notes|attendee/i);
 assert.match(sync,/privacy:'OPAQUE',safe_label:'Busy'/);
 assert.match(sync,/everest_customer_booking_id/);
});

test('Google OAuth is signed, encrypted and authenticated without exposing tokens',()=>{
 assert.match(oauth,/HMAC/);
 assert.match(oauth,/AES-GCM/);
 assert.match(oauth,/state\.exp>Date\.now\(\)/);
 assert.match(oauth,/userClient\.auth\.getUser\(\)/);
 assert.match(oauth,/customer_calendar_oauth_credentials/);
 assert.doesNotMatch(oauth,/console\.log\(.*token/i);
});

test('native device calendar requires permission and exports only Everest-owned booking events',()=>{
 assert.match(device,/requestCalendarPermissionsAsync/);
 assert.match(device,/getCalendarsAsync\(Calendar\.EntityTypes\.EVENT\)/);
 assert.match(device,/getEventsAsync/);
 assert.match(device,/createEventAsync/);
 assert.match(device,/title:'Everest booking'/);
 assert.match(client,/\['CONFIRMED','UPCOMING','IN_PROGRESS'\]/);
 assert.match(client,/deleteDeviceBookingEvent/);
});

test('customer UX exposes calendar controls and Ask Everest opt-in',()=>{
 assert.match(settings,/\/customer-calendar/);
 assert.match(screen,/Use busy time/);
 assert.match(screen,/Add Everest bookings/);
 assert.match(screen,/Use with Ask Everest/);
 assert.match(screen,/not private/i);
 assert.match(assistant,/customer_calendar_busy_blocks/);
 assert.match(assistant,/ONLY opaque busy start\/end windows/);
 assert.match(assistant,/OPEN_CUSTOMER_CALENDAR/);
 assert.match(assistantUi,/OPEN_CUSTOMER_CALENDAR/);
});

test('Expo native calendar dependency and permission plugin are configured',()=>{
 assert.match(pkg,/"expo-calendar": "~15\.0\.8"/);
 assert.match(appConfig,/"expo-calendar"/);
 assert.match(appConfig,/uses your calendar only when you choose/);
});
