import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';

const root = cwd();
const migration = [
  'supabase/migrations/20260921233000_service_aware_dispatch_engine.sql',
  'supabase/migrations/20260921235900_dispatch_relationship_prerequisites.sql',
  'supabase/migrations/20260921240000_dispatch_lifecycle_authority_correction.sql',
  'supabase/migrations/20260921241000_dispatch_state_audit_and_acceptance_guards.sql',
  'supabase/migrations/20260921241100_fix_dispatch_offer_response_guard.sql',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

const fn = (name) => {
  const start = migration.lastIndexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = migration.indexOf('create or replace function public.', start + 10);
  return migration.slice(start, next === -1 ? migration.length : next);
};

test('dispatch entry is BOOKED + CONFIRMED only', () => {
  const body = fn('start_service_dispatch');
  assert.match(body, /r\.status<>'BOOKED'/);
  assert.match(body, /b\.status<>'CONFIRMED'/);
  assert.match(body, /q\.status<>'ACCEPTED'/);
  assert.doesNotMatch(body, /alter.*request_status.*DISPATCHABLE/i);
});

test('dispatch entry verifies booking/request relationship', () => {
  const body = fn('start_service_dispatch');
  assert.match(body, /b\.request_id<>r\.id/);
  assert.match(body, /q\.request_id<>r\.id/);
});

test('dispatch assignment references request and booking', () => {
  assert.match(migration, /service_request_id uuid/);
  assert.match(migration, /booking_id uuid/);
  assert.match(migration, /service_dispatch_assignments_booking_request_fk/);
  assert.match(migration, /service_dispatch_assignments_job_request_fk/);
});

test('dispatch does not create quotes or bookings', () => {
  const body = fn('start_service_dispatch');
  assert.doesNotMatch(body, /insert into public\.(quotes|bookings)/i);
});

test('requested service capability is a hard eligibility filter', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /service_provider_capabilities/);
  assert.match(body, /cap\.service_id=j\.service_id/);
});

test('operational eligibility delegates to existing compliance authority', () => {
  const body = fn('dispatch_driver_is_operational');
  assert.match(body, /driver_applications/);
  assert.match(body, /evaluate_driver_compliance/);
  assert.match(body, /status<>'APPROVED'/);
});

test('existing driver availability is the availability authority', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /driver_availability/);
  assert.match(body, /da\.status='ONLINE'/);
  assert.doesNotMatch(body, /service_provider_profiles/);
});

test('service radius is enforced server-side', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /service_radius_km/);
});

test('fresh provider location is required', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /location_freshness_seconds/);
  assert.match(body, /recorded_at/);
});

test('ETA is explicitly a geographic proxy', () => {
  assert.match(migration, /dispatch_eta_proxy_seconds/);
  assert.match(migration, /eta_proxy_method','GEOGRAPHIC_PROXY'/);
});

test('ETA ranking is primary', () => {
  const body = fn('dispatch_next_service_provider');
  assert.match(body, /order by c\.eta_seconds,c\.location_age_seconds,c\.compatibility_score/);
});

test('provider-specific travel speed permits ETA to differ from raw distance', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /service_dispatch_provider_config/);
  assert.match(body, /travel_speed_kmh/);
});

test('offers are sequential and single-live', () => {
  assert.match(migration, /service_dispatch_one_live_offer_per_provider_idx/);
  const body = fn('dispatch_next_service_provider');
  assert.match(body, /limit 1/);
});

test('decline advances to the next provider', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /SERVICE_DISPATCH_OFFER_DECLINED/);
  assert.match(body, /dispatch_next_service_provider\(j\.id\)/);
});

test('timeout advances to the next provider', () => {
  const body = fn('process_service_dispatch_queue');
  assert.match(body, /expires_at<=now\(\)/);
  assert.match(body, /SERVICE_DISPATCH_OFFER_EXPIRED/);
  assert.match(body, /dispatch_next_service_provider\(x\.job_id\)/);
});

test('late acceptance is rejected deterministically', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /o\.expires_at<=now\(\)/);
  assert.match(body, /OFFER_NO_LONGER_AVAILABLE/);
});

test('acceptance re-checks operational, capability, availability, radius and freshness', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /dispatch_driver_is_operational/);
  assert.match(body, /service_provider_capabilities/);
  assert.match(body, /driver_availability/);
  assert.match(body, /LOCATION_STALE/);
  assert.match(body, /PROVIDER_OUTSIDE_SERVICE_RADIUS/);
});

test('acceptance locks the dispatch job and offer', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /where id=p_offer_id for update/);
  assert.match(body, /where id=o\.job_id for update/);
});

test('acceptance explicitly transitions ACCEPTED then ASSIGNED', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /status='ACCEPTED'/);
  assert.match(body, /status='ASSIGNED'/);
});

test('only one assignment can exist per job and provider', () => {
  assert.match(migration, /service_dispatch_assignments_job_id_key/);
  assert.match(migration, /service_dispatch_one_active_assignment_per_provider_idx/);
});

test('cross-domain delivery assignments are protected by the same provider lock', () => {
  assert.match(migration, /guard_delivery_assignment_provider_conflict/);
  assert.match(migration, /guard_service_dispatch_provider_conflict/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /delivery_assignments/);
});

test('unauthorized users cannot mutate dispatch state', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /o\.provider_id<>auth\.uid\(\)/);
  assert.match(body, /Not authorized/);
});

test('internal candidate/queue functions are not client executable', () => {
  assert.match(migration, /revoke all on function public\.get_service_dispatch_candidates/);
  assert.match(migration, /revoke all on function public\.dispatch_next_service_provider/);
  assert.match(migration, /revoke all on function public\.process_service_dispatch_queue/);
});

test('location updates are server-authoritative and adaptive', () => {
  const body = fn('update_provider_location');
  assert.match(body, /min_location_update_seconds/);
  assert.match(body, /LOCATION_UPDATE_TOO_FREQUENT/);
  assert.match(body, /dispatch_driver_is_operational/);
});

test('precise locations are provider-self only under RLS', () => {
  assert.match(migration, /service_provider_locations_self/);
  assert.match(migration, /provider_id=\(select auth\.uid\(\)\)/);
});

test('marketplace cancellation cancels an active dispatch without changing marketplace authority', () => {
  const body = fn('cancel_service_dispatch_on_marketplace_change');
  assert.match(body, /SERVICE_DISPATCH_CANCELLED/);
  assert.match(body, /NEW\.status<>'BOOKED'/);
  assert.match(body, /NEW\.status<>'CONFIRMED'/);
});

test('all dispatch SECURITY DEFINER functions pin search_path', () => {
  for (const name of [
    'guard_delivery_assignment_provider_conflict',
    'guard_service_dispatch_provider_conflict',
    'dispatch_driver_is_operational',
    'dispatch_eta_proxy_seconds',
    'start_service_dispatch',
    'get_service_dispatch_candidates',
    'dispatch_next_service_provider',
    'respond_service_dispatch_offer',
    'process_service_dispatch_queue',
    'update_provider_location',
    'cancel_service_dispatch_on_marketplace_change',
  ]) {
    assert.match(fn(name), /security definer set search_path to 'public'/i, name);
  }
});

test('Phase 1 migration remains present', () => {
  const phase1 = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260921210000_driver_availability.sql'),
    'utf8',
  );
  assert.match(phase1, /driver_availability/);
  assert.match(phase1, /set_driver_availability/);
});
