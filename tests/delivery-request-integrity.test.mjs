import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260921093000_delivery_request_state_integrity.sql', 'utf8');

test('delivery requests reject state regression after work has started', () => {
  assert.match(migration, /existing_status\s+public\.delivery_status/i);
  assert.match(migration, /existing_status\s+is\s+not\s+null\s+and\s+existing_status\s+not\s+in\s*\(\s*'PENDING'\s*,\s*'READY_FOR_PICKUP'\s*\)/i);
  assert.match(migration, /Delivery request is already in progress or completed/i);
});

test('delivery request remains authenticated and server-authoritative', () => {
  assert.match(migration, /revoke\s+execute\s+on\s+function\s+public\.request_delivery_for_order\(uuid\)\s+from\s+anon/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.request_delivery_for_order\(uuid\)\s+to\s+authenticated/i);
  assert.match(migration, /public\.is_business_member\(o\.business_id\)\s+or\s+public\.is_admin\(\)/i);
});
