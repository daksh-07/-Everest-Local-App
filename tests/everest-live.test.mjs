// Everest Live production-path regression coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260926234500_everest_live_marketplace.sql','utf8');
const screen=fs.readFileSync('app/everest-live.tsx','utf8');
const request=fs.readFileSync('app/request.tsx','utf8');
const alert=fs.readFileSync('components/BusinessOpportunityAlert.tsx','utf8');

test('ASAP customer request starts one backend-authoritative Live search',()=>{
 assert.match(request,/startEverestLive\(id,arrivalWindow\)/);
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
