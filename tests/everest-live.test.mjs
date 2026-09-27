// Everest Live production-path regression coverage (CI).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260926234500_everest_live_marketplace.sql','utf8');
const screen=fs.readFileSync('app/everest-live.tsx','utf8');
const request=fs.readFileSync('app/request.tsx','utf8');
const alert=fs.readFileSync('components/BusinessOpportunityAlert.tsx','utf8');
const preciseMigration=fs.readFileSync('supabase/migrations/20260927124500_precise_service_location_live_map.sql','utf8');
const nativeMap=fs.readFileSync('components/LiveSearchMap.native.tsx','utf8');
const webMap=fs.readFileSync('components/LiveSearchMap.web.tsx','utf8');
const marketplace=fs.readFileSync('lib/marketplace.ts','utf8');
const businessJob=fs.readFileSync('app/business-job.tsx','utf8');

test('ASAP customer request starts one backend-authoritative Live search',()=>{
 assert.match(request,/startEverestLive\(id,\s*arrivalWindow\)/);
 assert.match(migration,/create or replace function public\.start_everest_live/);
 assert.match(migration,/where id=p_request_id and customer_id=auth\.uid\(\) for update/);
 assert.match(migration,/unique \(request_id,business_id\)|on conflict\(request_id,business_id\) do nothing/);
});

test('eligibility enforces capability, active verification, availability, radius and conflicts',()=>{
 for(const rule of ["s.active","b.status='ACTIVE'","b.verification_status='VERIFIED'","ba.status='AVAILABLE_NOW'","service_radius_km","service_dispatch_assignments"]){assert.match(migration,new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}
 assert.match(migration,/public\.everest_distance_km[\s\S]*<=p_radius_km/);
});

test('progressive search is bounded and never re-notifies a business',()=>{
 assert.match(migration,/when 2 then 7 when 3 then 10 else 15/);
 assert.match(migration,/not exists\(select 1 from public\.opportunities old/);
 assert.match(migration,/live_radius_stage<4/);
});

test('provider view, decline and quote response preserve marketplace lifecycle',()=>{
 assert.match(migration,/view_live_opportunity/);
 assert.match(alert,/decline_opportunity/);
 assert.match(migration,/trg_everest_live_quote_response/);
 assert.match(screen,/acceptQuote\(quoteId\)/);
});

test('cancel and expiry atomically stop pending opportunities',()=>{
 assert.match(migration,/create or replace function public\.cancel_everest_live/);
 assert.match(migration,/update public\.opportunities set status='EXPIRED'/);
 assert.match(migration,/live_expires_at<=now\(\)/);
});

test('customer sees real counts, realtime changes and reconnect recovery',()=>{
 assert.match(migration,/eligible_count bigint,notified_count bigint,viewed_count bigint,responding_count bigint,quote_count bigint/);
 assert.match(screen,/postgres_changes/);
 assert.match(screen,/Reconnecting to your live search/);
 assert.match(screen,/setInterval\(\(\)=>void refresh\(true\),30000\)/);
});

test('exact coordinates are not returned by Live state or business notifications',()=>{
 const state=migration.slice(migration.indexOf('create or replace function public.get_everest_live_state'));
 assert.doesNotMatch(state.split('-- Existing RLS')[0],/r\.latitude|r\.longitude/);
 const notification=migration.slice(migration.indexOf('create or replace function public.notify_opportunity_insert'));
 assert.doesNotMatch(notification.split('create or replace function public.process_everest_live_searches')[0],/latitude|longitude|address_line/);
 assert.match(alert,/approximate_distance_km/);
});

test('Live UI has no fake provider markers or random marketplace counts',()=>{
 assert.doesNotMatch(screen,/Math\.random|fake|mockProvider|providerMarkers/);
 assert.match(screen,/state\?\.notified_count/);
 assert.match(screen,/state\?\.viewed_count/);
 assert.match(screen,/state\?\.quote_count/);
});

test('security keeps service functions restricted and RLS-backed',()=>{
 for(const fn of ['start_everest_live','expand_everest_live','cancel_everest_live','view_live_opportunity','get_everest_live_state'])assert.match(migration,new RegExp(`revoke all on function public\\.${fn}`));
 assert.doesNotMatch(screen,/service_role|SUPABASE_SERVICE/);
});


test('local requests require and persist a precise geocoded service address',()=>{
 assert.match(marketplace,/create_service_request_v4/);
 assert.match(preciseMigration,/address_line1 text/);
 assert.match(preciseMigration,/service_address_label text/);
 assert.match(preciseMigration,/p_latitude is null or p_longitude is null/);
 assert.match(preciseMigration,/A precise service location is required for local service/);
 assert.match(request,/USE PRECISE LOCATION/);
 assert.match(request,/CONFIRM PRECISE ADDRESS/);
 assert.match(request,/serviceAddressLabel/);
});

test('Everest Live requires the confirmed precise pin and uses real map points',()=>{
 assert.match(preciseMigration,/confirmed precise service address is required for Everest Live/);
 assert.match(screen,/getEverestLiveMapPoints/);
 assert.match(screen,/LiveSearchMap/);
 assert.match(nativeMap,/MapView/);
 assert.match(nativeMap,/Circle/);
 assert.match(webMap,/openstreetmap\.org\/export\/embed\.html/);
 assert.doesNotMatch(nativeMap,/Math\.random|mock|fake/i);
 assert.doesNotMatch(webMap,/Math\.random|mockProvider|fakeProvider/i);
});

test('Live business markers represent only businesses that actually received the offer',()=>{
 const fn=preciseMigration.slice(preciseMigration.indexOf('create or replace function public.get_everest_live_map_points'));
 assert.match(fn,/join request_row r on r\.id=o\.request_id/);
 assert.match(fn,/where o\.is_live/);
 assert.match(fn,/when o\.responded_at is not null then 'RESPONDED'/);
 assert.match(fn,/when o\.viewed_at is not null then 'VIEWED'/);
 assert.match(fn,/else 'NOTIFIED'/);
});

test('customer exact pin stays private while Live business positions are coarse',()=>{
 const fn=preciseMigration.slice(preciseMigration.indexOf('create or replace function public.get_everest_live_map_points'));
 assert.match(fn,/r\.customer_id=auth\.uid\(\)/);
 assert.match(fn,/r\.latitude,r\.longitude,'YOU'/);
 assert.match(fn,/round\(lb\.raw_latitude::numeric,2\)/);
 assert.match(fn,/round\(lb\.raw_longitude::numeric,2\)/);
 const notification=migration.slice(migration.indexOf('create or replace function public.notify_opportunity_insert'));
 assert.doesNotMatch(notification.split('create or replace function public.process_everest_live_searches')[0],/address_line1|service_address_label|r\.latitude|r\.longitude/);
});

test('selected business gets exact booked address, not pre-booking candidates',()=>{
 const fn=preciseMigration.slice(preciseMigration.indexOf('create or replace function public.get_booking_service_location'));
 assert.match(fn,/public\.is_business_member\(b\.business_id\)/);
 assert.match(fn,/b\.status::text<>'CANCELLED'/);
 assert.match(fn,/r\.service_address_label,r\.latitude,r\.longitude/);
 assert.match(businessJob,/getBookingServiceLocation/);
 assert.match(businessJob,/OPEN DIRECTIONS/);
});

test('Live offers expose real ETA without exposing the customer home address',()=>{
 assert.match(alert,/eta_seconds/);
 assert.match(alert,/min away/);
 assert.doesNotMatch(alert,/address_line1|service_address_label|latitude|longitude/);
});
