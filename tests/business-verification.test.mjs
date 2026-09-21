import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { isValidAbn, normalizeAbn } = await import('../lib/abn.ts');
const migration = await readFile(
  'supabase/migrations/20260920111150_business_abn_verification_flow.sql',
  'utf8',
);
const abrMigration = await readFile(
  'supabase/migrations/20260920233000_abr_government_verification.sql',
  'utf8',
);
const abrFunction = await readFile(
  'supabase/functions/business-abn-verify/index.ts',
  'utf8',
);
const searchPathHardeningMigration = await readFile(
  'supabase/migrations/20260920112705_business_verification_search_path_hardening.sql',
  'utf8',
);
const legacySubmissionHardeningMigration = await readFile(
  'supabase/migrations/20260920234000_restrict_legacy_business_verification_submission.sql',
  'utf8',
);
const screen = await readFile('app/business-verification.tsx', 'utf8');
const flow = await readFile('lib/business-verification.ts', 'utf8');
const baseVerification = await readFile('supabase/migrations/006_business_verification.sql', 'utf8');

test('ABN normalization removes spaces and hyphens only', () => {
  assert.equal(normalizeAbn('82 644 881 283'), '82644881283');
  assert.equal(normalizeAbn('82-644-881-283'), '82644881283');
  assert.equal(normalizeAbn('82.644.881.283'), '82.644.881.283');
});

test('valid ABN checksum is accepted', () => {
  assert.equal(isValidAbn('51 824 753 556'), true);
  assert.equal(isValidAbn('82644881283'), true);
});

test('invalid ABN checksum is rejected', () => {
  assert.equal(isValidAbn('51 824 753 557'), false);
  assert.equal(isValidAbn('82644881284'), false);
});

test('ABN length and character validation is enforced', () => {
  assert.equal(isValidAbn('5182475355'), false);
  assert.equal(isValidAbn('5182475355 1'), false);
  assert.equal(isValidAbn('51824753A556'), false);
});

test('server-side ABN validation uses the official modulus-89 weights', () => {
  assert.match(migration, /substring\(abn,1,1\)::integer - 1\) \* 10/);
  assert.match(migration, /substring\(abn,11,1\)::integer \* 19/);
  assert.match(migration, /mod\([\s\S]*89[\s\S]*\)/);
  assert.match(migration, /abn !~ '\^\[0-9\]\{11\}\$'/);
});

test('server normalizes and stores the ABN before creating PENDING verification', () => {
  assert.match(migration, /regexp_replace\(coalesce\(p_abn,''\), '\[\[:space:\]-\]'/);
  assert.match(migration, /abn,\s*documents\s*\)/);
  assert.match(migration, /normalized_abn,\s*coalesce\(p_documents/);
  assert.match(migration, /verification_status = 'PENDING'/);
});

test('server authorization and duplicate-pending guards remain authoritative', () => {
  assert.match(migration, /is_business_member\(p_business_id\) and not public\.is_admin\(\)/);
  assert.match(migration, /message = 'NOT_AUTHORIZED'/);
  assert.match(migration, /message = 'VERIFICATION_PENDING'/);
  assert.match(migration, /business_verifications_one_pending_per_business/);
});

test('SECURITY DEFINER functions use an empty search_path', () => {
  assert.match(searchPathHardeningMigration, /security definer[\s\S]*set search_path = ''/);
  assert.match(searchPathHardeningMigration, /public\.businesses/);
  assert.match(searchPathHardeningMigration, /public\.business_verifications/);
});

test('verification status cannot be self-promoted by direct business updates', () => {
  assert.match(migration, /new\.verification_status = 'PENDING'/);
  assert.match(migration, /old\.verification_status in \('UNVERIFIED','REJECTED'\)/);
  assert.match(migration, /everest\.business_verification_submission/);
  assert.match(baseVerification, /if not public\.is_admin\(\) then raise exception 'Admin authorization required'/);
});

test('admin verification remains server-authorized', () => {
  assert.match(baseVerification, /create or replace function public\.admin_set_verification/);
  assert.match(baseVerification, /if not public\.is_admin\(\) then raise exception 'Admin authorization required'/);
  assert.match(baseVerification, /reviewed_by=auth\.uid\(\)/);
  assert.match(baseVerification, /reviewed_at=now\(\)/);
});

test('client maps expected backend errors and hides unexpected database details', () => {
  for (const code of [
    'INVALID_ABN',
    'ABN_NOT_FOUND',
    'ABN_NOT_ACTIVE',
    'BUSINESS_NAME_MISMATCH',
    'GOVERNMENT_LOOKUP_UNAVAILABLE',
    'VERIFICATION_PENDING',
    'NOT_AUTHORIZED',
    'VERIFICATION_ALREADY_COMPLETED',
    'DATABASE_ERROR',
  ]) {
    assert.match(flow, new RegExp(code));
  }
  assert.match(screen, /Reference:/i);
  assert.doesNotMatch(screen, /catch\{setError\('We could not submit verification right now\. Please check the ABN and try again\.'\)}/);
});

test('client handles successful HTTP responses that contain a terminal ABR rejection status', () => {
  assert.match(flow, /value\.error \?\? value\.reason \?\? value\.status/);
  assert.match(flow, /status !== 'VERIFIED'/);
  assert.match(flow, /ABN_MISMATCH/);
  assert.match(flow, /PENDING_RETRY/);
});

test('documents are not falsely presented as uploaded', () => {
  assert.match(screen, /ABN submission is the first verification step/);
  assert.match(screen, /may request supporting documents during review/);
  assert.doesNotMatch(screen, /upload complete|documents uploaded|fake upload|simulated upload/i);
});

test('ABR government verification is server-only and stores provider evidence', () => {
  assert.match(abrMigration, /verification_provider/);
  assert.match(abrMigration, /submit_business_verification_from_abr/);
  assert.match(abrMigration, /current_setting\('request\.jwt\.claims', true\)/);
  assert.match(abrMigration, /service_role/);
  assert.match(abrMigration, /revoke execute[\s\S]*authenticated/);
});

test('ABR Edge Function verifies active ABN and business-name match before submission', () => {
  assert.match(abrFunction, /ABR_LOOKUP_GUID/);
  assert.match(abrFunction, /abr\.business\.gov\.au\/json\/AbnDetails\.aspx/);
  assert.match(abrFunction, /AbnStatus/);
  assert.match(abrFunction, /BusinessName/);
  assert.match(abrFunction, /BUSINESS_NAME_MISMATCH/);
  assert.match(abrFunction, /submit_business_verification_from_abr/);
  assert.match(abrFunction, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('admin verification RPC remains available to authenticated callers but enforces admin authorization inside the function', () => {
  assert.match(abrMigration, /grant execute on function public\.admin_set_verification[\s\S]*to authenticated/);
  assert.match(baseVerification, /if not public\.is_admin\(\) then raise exception 'Admin authorization required'/);
});

test('client presents pending state instead of a dead submit control', () => {
  assert.match(screen, /under review/i);
  assert.match(screen, /CHECK ABN & SUBMIT/);
  assert.match(screen, /Australian Business Register/);
});

test('legacy direct verification submission cannot bypass ABR verification', () => {
  assert.match(legacySubmissionHardeningMigration, /revoke execute on function public\.submit_business_verification[\s\S]*authenticated/);
  assert.match(legacySubmissionHardeningMigration, /grant execute on function public\.submit_business_verification[\s\S]*service_role/);
});
