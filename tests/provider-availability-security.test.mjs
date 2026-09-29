import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260928172000_harden_provider_availability_membership.sql','utf8');

test('provider availability requires an active verified business membership', () => {
  assert.match(sql, /bm\.status='ACTIVE'/);
  assert.match(sql, /b\.status='ACTIVE'/);
  assert.match(sql, /b\.verification_status='VERIFIED'/);
  assert.match(sql, /revoke all on function public\.set_service_provider_profile\(uuid,text,numeric,numeric\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.set_service_provider_profile\(uuid,text,numeric,numeric\) to authenticated/i);
});
