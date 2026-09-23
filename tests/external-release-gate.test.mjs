import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cryptoCompat = fs.readFileSync('supabase/migrations/20260923045959_external_crypto_compat.sql','utf8');
const optOut = fs.readFileSync('supabase/migrations/20260923093000_external_gateway_self_service_opt_out.sql','utf8');
const gateway = fs.readFileSync('supabase/functions/external-quote-gateway/index.ts','utf8');

test('pgcrypto compatibility helpers are locked away from API roles', () => {
  assert.match(cryptoCompat, /extensions\.digest/);
  assert.match(cryptoCompat, /extensions\.gen_random_bytes/);
  assert.match(cryptoCompat, /revoke all on function public\.digest\(text,text\) from public, anon, authenticated, service_role/i);
  assert.match(cryptoCompat, /revoke all on function public\.gen_random_bytes\(integer\) from public, anon, authenticated, service_role/i);
});

test('gateway opt-out is service-role-only and creates global destination suppression', () => {
  assert.match(optOut, /auth\.role\(\) <> 'service_role'/);
  assert.match(optOut, /suppress_external_contact/);
  assert.match(optOut, /'BUSINESS_OPTOUT'/);
  assert.match(optOut, /revoke all on function public\.opt_out_external_gateway_contact\(text\) from public, anon, authenticated/i);
  assert.match(optOut, /grant execute on function public\.opt_out_external_gateway_contact\(text\) to service_role/i);
});

test('external gateway exposes opt-out without adding promotional copy', () => {
  assert.match(gateway, /action'\) \?\? ''\) === 'optout'/);
  assert.match(gateway, /opt_out_external_gateway_contact/);
  assert.match(gateway, /Do not send future Everest enquiries/);
  assert.doesNotMatch(gateway, /grow your business|join everest|sign up now|get more customers/i);
});
