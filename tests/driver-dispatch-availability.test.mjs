import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dispatchMigration = await readFile('supabase/migrations/20260921211500_driver_dispatch_availability_guard.sql', 'utf8');
const rlsMigration = await readFile('supabase/migrations/20260921230000_optimize_driver_availability_rls.sql', 'utf8');

assert.match(dispatchMigration, /driver_availability/);
assert.match(dispatchMigration, /availability\.status<>'ONLINE'/);
assert.match(dispatchMigration, /active delivery/);
assert.match(dispatchMigration, /delivery_assignments_one_active_job_per_driver_idx/);
assert.match(dispatchMigration, /accepted_at is not null and completed_at is null/);
assert.match(dispatchMigration, /security\s+definer/i);
assert.match(dispatchMigration, /set\s+search_path\s+to\s+'public'/i);

assert.match(rlsMigration, /drop policy if exists driver_availability_select_own/);
assert.match(rlsMigration, /create policy driver_availability_select_own/);
assert.match(rlsMigration, /driver_id = \(select auth\.uid\(\)\)/);
assert.doesNotMatch(rlsMigration, /using \(driver_id=auth\.uid\(\)\)/);
