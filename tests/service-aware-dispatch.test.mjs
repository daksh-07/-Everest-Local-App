import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';

const root = cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260921233000_service_aware_dispatch_engine.sql'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'supabase/migrations/20260921233100_service_dispatch_authority.sql'), 'utf8');

const fn = (name) => {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = migration.indexOf('create or replace function public.', start + 10);
  return migration.slice(start, next === -1 ? migration.length : next);
};

test('dispatch ranking uses ETA first and keeps freshness/compatibility as tie-breakers', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /eta_seconds/);
  assert.match(body, /order by eta_seconds,location_age_seconds,compatibility_score/);
  assert.match(body, /travel_speed_kmh/);
});

test('service radius is enforced server-side', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /distance_km <= .*service_radius_km/s);
});

test('requested service capability is required', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /service_provider_capabilities/);
  assert.match(body, /pc\.service_id=j\.service_id/);
});

test('fresh location is required for dispatch eligibility', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /location_freshness_seconds/);
  assert.match(body, /recorded_at/);
});

test('active provider assignments are excluded', () => {
  const body = fn('get_service_dispatch_candidates');
  assert.match(body, /service_dispatch_assignments/);
  assert.match(body, /completed_at is null/);
});

test('offer expiration is configurable rather than hard-coded', () => {
  const body = fn('dispatch_next_service_provider');
  assert.match(body, /offer_timeout_seconds/);
  assert.match(body, /make_interval\(secs=>cfg\.offer_timeout_seconds\)/);
});

test('decline continues dispatch to another provider', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /SERVICE_DISPATCH_OFFER_DECLINED/);
  assert.match(body, /dispatch_next_service_provider\(j\.id\)/);
});

test('expired offers continue dispatch and cannot be accepted late', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /expires_at<=now\(\)/);
  assert.match(body, /status='EXPIRED'/);
  assert.match(body, /Job no longer available/);
});

test('job claim is an atomic SEARCHING/PROVIDER_OFFERED state transition', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /for update/);
  assert.match(body, /status='PROVIDER_OFFERED'/);
  assert.match(body, /if not found then/);
  assert.match(migration, /service_dispatch_assignments\(provider_id\).*where completed_at is null/s);
});

test('a provider cannot hold two active assignments', () => {
  assert.match(migration, /service_dispatch_one_active_assignment_per_provider_idx/);
  assert.match(migration, /where completed_at is null/);
});

test('customer cannot start dispatch for another customer request', () => {
  const body = fn('start_service_dispatch');
  assert.match(body, /customer_id<>\(select auth\.uid\(\)\)/);
  assert.match(body, /Not authorized/);
});

test('provider cannot respond to another provider offer', () => {
  const body = fn('respond_service_dispatch_offer');
  assert.match(body, /o\.provider_id<>\(select auth\.uid\(\)\)/);
  assert.match(body, /Not authorized/);
});

test('client cannot directly execute internal candidate or queue functions', () => {
  assert.match(migration, /revoke all on function public\.get_service_dispatch_candidates/);
  assert.match(migration, /revoke all on function public\.dispatch_next_service_provider/);
  assert.match(migration, /revoke all on function public\.process_service_dispatch_queue/);
});

test('all dispatch SECURITY DEFINER functions pin search_path', () => {
  for (const name of ['set_service_request_location','set_service_provider_profile','update_service_provider_location','set_service_provider_capability','get_service_dispatch_candidates','dispatch_next_service_provider','start_service_dispatch','respond_service_dispatch_offer','process_service_dispatch_queue']) {
    assert.match(fn(name), /security definer set search_path to 'public'/i, `${name} must pin search_path`);
  }
});

test('Phase 1 driver availability migration remains present and untouched', () => {
  const phase1 = fs.readFileSync(path.join(root, 'supabase/migrations/20260921210000_driver_availability.sql'), 'utf8');
  assert.match(phase1, /set_driver_availability/);
  assert.match(phase1, /driver_availability/);
});
