import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260921211500_driver_dispatch_availability_guard.sql', 'utf8');

assert.match(migration, /driver_availability/);
assert.match(migration, /availability\.status<>'ONLINE'/);
assert.match(migration, /active delivery/);
assert.match(migration, /delivery_assignments_one_active_job_per_driver_idx/);
assert.match(migration, /accepted_at is not null and completed_at is null/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /SET search_path TO 'public'/);
