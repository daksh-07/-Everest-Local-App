import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { isValidAbn, normalizeAbn } = await import('../lib/abn.ts');
const migration = await readFile(
  'supabase/migrations/20260920111150_business_abn_verification_flow.sql',
  'utf8',
);
const searchPathHardeningMigration = await readFile(
  'supabase/migrations/20260920112705_business_verification_search_path_hardening.sql',
  'utf8',
);
const screen = await readFile('app/business-verification.tsx', 'utf8');
const flow = await readFile('lib/business-verification.ts', 'utf8');
const baseVerification = await readFile('supabase/migrations/006_business_verification.sql', 'utf8');
const abrFunction = await readFile('supabase/functions/verify-business-abn/index.ts', 'utf8');
const abrMigration = await readFile('supabase/migrations/20260920133000_business_abr_registry_check.sql', 'utf8');
const adminScreen = await readFile('app/admin.tsx', 'utf8');

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
  assert.equal(isValidAbn('51824753556 1'), false);
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
    'VERIFICATION_PENDING',
    'NOT_AUTHORIZED',
    'VERIFICATION_ALREADY_COMPLETED',
    'DATABASE_ERROR',
  ]) {
    assert.match(flow, new RegExp(code));
  }
  assert.match(screen, /Reference:/i);
  assert.doesNotMatch(screen, /catch\{setError\('We could not submit verification right now\. Please check the ABN and try again\.'\)\}/);
});

test('documents are not falsely presented as uploaded', () => {
  assert.match(screen, /ABN submission is the first verification step/);
  assert.match(screen, /may request supporting documents during review/);
  assert.doesNotMatch(screen, /upload complete|documents uploaded|fake upload|simulated upload/i);
});


test('ABR registry verification is server-side, admin-authorized and auditable', () => {
  assert.match(abrFunction, /Deno\.env\.get\('ABR_AUTH_GUID'\)/);
  assert.match(abrFunction, /abr\.business\.gov\.au\/ABRXMLSearch\/AbrXmlSearch\.asmx\/SearchByABNv202001/);
  assert.match(abrFunction, /includeHistoricalDetails.*N/);
  assert.match(abrFunction, /profile\?\.role !== 'ADMIN'/);
  assert.match(abrFunction, /record_business_abr_check/);
  assert.doesNotMatch(abrFunction, /EXPO_PUBLIC_ABR|ABR_AUTH_GUID\s*=\s*['"][^'"]+['"]/);
  assert.doesNotMatch(abrFunction, /callback|parseJsonp|AbnDetails\.aspx/);
  assert.match(abrMigration, /security definer[\s\S]*set search_path = ''/);
  assert.match(abrMigration, /business_abr_check/);
  assert.match(adminScreen, /verify-business-abn/);
  assert.match(adminScreen, /CHECK GOVERNMENT REGISTRY/);
});

test('ABR evidence never directly auto-promotes a business', () => {
  assert.doesNotMatch(abrFunction, /admin_set_verification/);
  assert.match(abrFunction, /Final marketplace approval remains an Everest admin decision/);
});
