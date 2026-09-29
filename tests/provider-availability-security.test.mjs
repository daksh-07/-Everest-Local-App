import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260928172000_active_business_membership_and_live_hardening.sql','utf8');

test('retired provider profile API cannot bypass current workforce permissions', () => {
  assert.match(sql, /drop function if exists public\.set_service_provider_profile\(uuid,text,numeric,numeric\)/i);
  assert.match(sql, /bm\.status='ACTIVE'/);
  assert.match(sql, /b\.status='ACTIVE'/);
  assert.match(sql, /b\.verification_status='VERIFIED'/);
  assert.match(sql, /revoke all on function public\.release_everest_live_wave\(uuid,numeric,integer\) from public,anon,authenticated/i);
});
