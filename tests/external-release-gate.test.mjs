import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cryptoCompat = fs.readFileSync('supabase/migrations/20260923045959_external_crypto_compat.sql','utf8');
const optOut = fs.readFileSync('supabase/migrations/20260923093000_external_gateway_self_service_opt_out.sql','utf8');
const gateway = fs.readFileSync('supabase/functions/external-quote-gateway/index.ts','utf8');
const lockOrder = fs.readFileSync('supabase/migrations/20260923110000_external_gateway_lock_order.sql','utf8');
const search = fs.readFileSync('app/search.tsx','utf8');
const directory = fs.readFileSync('app/external-businesses.tsx','utf8');

test('gateway operations lock enquiry before token and recheck the token hash', () => {
  for (const functionName of ['read_external_gateway', 'submit_external_gateway_quote', 'opt_out_external_gateway_contact']) {
    const body = lockOrder.split(`create or replace function public.${functionName}(`)[1]?.split('end; $$;')[0] ?? '';
    assert.ok(body.indexOf('for update') > -1, `${functionName} takes a row lock`);
    const enquiryLock = body.search(/from public\.external_enquiries\s+where[^;]*for update/i);
    const tokenLock = body.search(/from public\.external_gateway_tokens\s+where enquiry_id[^;]*for update/i);
    assert.ok(enquiryLock >= 0 && tokenLock > enquiryLock, `${functionName} locks enquiry first`);
    assert.match(body, /token_hash\s*=\s*public\.digest\(p_token,'sha256'\)/);
  }
});

test('external directory remains visually and operationally separate from native search', () => {
  assert.match(search, /Search businesses outside Everest/);
  assert.match(search, /external-businesses/);
  assert.doesNotMatch(search, /functions\.invoke\('external-discovery'/);
  assert.match(directory, /NOT YET ON EVEREST/);
  assert.match(directory, /AUTHORISE THIS ENQUIRY/);
});

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
