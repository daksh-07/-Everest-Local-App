import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260921233400_service_dispatch_evaluation_audit.sql'), 'utf8');

test('dispatch records provider eligibility and exclusion reasons', () => {
  assert.match(migration, /service_dispatch_evaluations/);
  assert.match(migration, /BUSINESS_NOT_VERIFIED/);
  assert.match(migration, /LOCATION_UNAVAILABLE/);
  assert.match(migration, /LOCATION_STALE/);
  assert.match(migration, /SERVICE_INCOMPATIBLE/);
  assert.match(migration, /OUTSIDE_SERVICE_RADIUS/);
  assert.match(migration, /ACTIVE_ASSIGNMENT/);
  assert.match(migration, /BUSINESS_NOT_ACCEPTING_REQUESTS/);
});

test('dispatch audit remains server-only', () => {
  assert.match(migration, /security definer set search_path to 'public'/i);
  assert.match(migration, /revoke all on function public\.audit_service_dispatch_evaluations/);
});
