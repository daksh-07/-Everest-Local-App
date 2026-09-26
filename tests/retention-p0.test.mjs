import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile('supabase/migrations/20260926193000_retention_p0_saved_searches_instant_booking.sql','utf8');
const retention=await readFile('lib/retention.ts','utf8');

test('saved searches are owner isolated and matches cannot be written by customers',()=>{
 assert.match(migration,/create table if not exists public\.saved_searches/);
 assert.match(migration,/saved_searches_owner_all/);
 assert.match(migration,/\(select auth\.uid\(\)\)=user_id/);
 assert.match(migration,/revoke all on public\.saved_searches,public\.saved_search_matches from public,anon/);
 assert.match(migration,/revoke all on public\.saved_search_matches from authenticated/);
 assert.match(migration,/unique\(saved_search_id,matched_entity_type,matched_entity_id\)/);
 assert.match(migration,/SAVED_SEARCH_MATCH/);
});
test('instant booking is server authoritative and capacity guarded',()=>{
 assert.match(migration,/create table if not exists public\.business_booking_settings/);
 assert.match(migration,/create table if not exists public\.instant_booking_slots/);
 assert.match(migration,/for update/);
 assert.match(migration,/active_count>=cfg\.capacity/);
 assert.match(migration,/external_calendar_busy_blocks/);
 assert.match(migration,/crm_calendar_blocks/);
 assert.match(migration,/s\.base_price/);
 assert.match(migration,/This business does not service that location/);
 assert.match(migration,/revoke all on function public\.instant_book_service/);
});
test('client calls only authorized RPC boundaries',()=>{
 assert.match(retention,/get_instant_booking_slots/);
 assert.match(retention,/instant_book_service/);
 assert.doesNotMatch(retention,/from\('bookings'\)\.insert/);
 assert.doesNotMatch(retention,/from\('quotes'\)\.insert/);
});
