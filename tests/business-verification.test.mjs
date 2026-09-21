import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { isValidAbn, normalizeAbn } = await import('../lib/abn.ts');
const migration = await readFile('supabase/migrations/20260921073000_automated_business_abn_verification.sql', 'utf8');
const caseMigration = await readFile('supabase/migrations/20260921073100_business_verification_case_types.sql', 'utf8');
const searchPathHardeningMigration = await readFile(
  'supabase/migrations/20260920112705_business_verification_search_path_hardening.sql',
  'utf8',
);
const screen = await readFile('app/business-verification.tsx', 'utf8');
const flow = await readFile('lib/business-verification.ts', 'utf8');
const edgeFunction = await readFile('supabase/functions/business-abn-verify/index.ts', 'utf8');
const adminScreen = await readFile('app/admin.tsx', 'utf8');
const config = await readFile('supabase/config.toml', 'utf8');

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
  assert.match(
    migration,
    /substring\(abn,1,1\)::integer - 1\) \* 10[\s\S]*substring\(abn,11,1\)::integer \* 19/,
  );
  assert.match(migration, /mod\([\s\S]*89[\s\S]*\)/);
  assert.match(migration, /abn !~ '\^\[0-9\]\{11\}\$'/);
});

test('automated verification has atomic server-side rate limiting and duplicate protection', () => {
  assert.match(migration, /abn_verification_attempts/);
  assert.match(migration, /recent_user_attempts >= 5 or recent_business_attempts >= 5/);
  assert.match(migration, /business_verifications[s\S]*status = 'PENDING'/);
  assert.match(migration, /message = 'VERIFICATION_PENDING'/);
  assert.match(migration, /message = 'RATE_LIMITED'/);
});

test('automated database functions are server-only and use a pinned empty search_path', () => {
  assert.match(migration, /begin_automated_abn_verification[\s\S]*set search_path = ''/);
  assert.match(migration, /finish_automated_abn_verification[\s\S]*set search_path = ''/);
  assert.match(migration, /current_setting\('request.jwt.claims', true\)::json->>'role'\) <> 'service_role'/);
  assert.match(migration, /revoke all on function public.begin_automated_abn_verification/);
  assert.match(migration, /revoke all on function public.finish_automated_abn_verification/);
  assert.match(searchPathHardeningMigration, /security definer[\s\S]*set search_path = ''/);
});

test('automatic verification can promote only the trusted backend result', () => {
  assert.match(migration, /v_decision = 'AUTO_VERIFIED'/);
  assert.match(migration, /status = 'VERIFIED'/);
  assert.match(migration, /verification_status = 'VERIFIED'/);
  assert.match(migration, /ABN_VERIFICATION_AUTO_APPROVED/);
  assert.match(migration, /set role = 'BUSINESS'/);
  assert.doesNotMatch(edgeFunction, /admin_set_verification/);
});

test('automatic rejection records a deterministic safe reason', () => {
  assert.match(edgeFunction, /ABN_NOT_FOUND/);
  assert.match(edgeFunction, /ABN_NOT_ACTIVE/);
  assert.match(edgeFunction, /BUSINESS_NAME_MISMATCH/);
  assert.match(migration, /ABN_VERIFICATION_AUTO_REJECTED/);
  assert.match(screen, /VERIFICATION NOT APPROVED/);
  assert.match(screen, /Check ABN Again/i);
  assert.match(screen, /Edit Business Details/i);
  assert.match(screen, /Get Help/i);
  assert.match(screen, /Request Manual Review/i);
  assert.match(screen, /Submit Feedback/i);
});

test('temporary ABR failures become retry state rather than rejection', () => {
  assert.match(edgeFunction, /status: 'RETRY'/);
  assert.match(edgeFunction, /status: 'PENDING_RETRY'/);
  assert.match(migration, /automated_decision = 'RETRY'/);
  assert.match(migration, /retry_after = now\(\) \+ interval '60 seconds'/);
  assert.match(screen, /temporary verification-service problem/i);
});

test('existing ABR Web Services integration remains server-side', () => {
  assert.match(edgeFunction, /Deno\.env\.get\('ABR_LOOKUP_GUID'\)/);
  assert.match(edgeFunction, /ABRXMLSearch\/AbrXmlSearch\.asmx\/SearchByABNv202001/);
  assert.match(edgeFunction, /includeHistoricalDetails/);
  assert.match(edgeFunction, /authenticationGuid/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
  assert.doesNotMatch(edgeFunction, /EXPO_PUBLIC_ABR|EXPO_PUBLIC.*GUID/);
  assert.doesNotMatch(screen, /ABR_LOOKUP_GUID|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
  assert.match(config, /\[functions\.business-abn-verify\]/);
  assert.doesNotMatch(config, /\[functions\.verify-business-abn\]/);
});

test('authoritative ABR identity fields are parsed and name matching is deterministic', () => {
  assert.match(edgeFunction, /entityStatusCode/);
  assert.match(edgeFunction, /isCurrentIndicator/);
  assert.match(edgeFunction, /mainName/);
  assert.match(edgeFunction, /businessName/);
  assert.match(edgeFunction, /legalName/);
  assert.match(edgeFunction, /PROPRIETARY\\s\+LIMITED|PTY\\s\+LTD/);
  assert.match(edgeFunction, /normalizeName/);
});

test('client invokes the existing server verification integration, not a client-side provider', () => {
  assert.match(flow, /functions\.invoke\('business-abn-verify'/);
  assert.doesNotMatch(flow, /rpc\('submit_business_verification'/);
  assert.doesNotMatch(flow, /ABR_LOOKUP_GUID|SUPABASE_SERVICE_ROLE_KEY/);
});

test('manual review is a real server-authorized case and cannot self-approve', () => {
  assert.match(caseMigration, /business_verification_reviews/);
  assert.match(caseMigration, /case_type/);
  assert.match(caseMigration, /business_members/);
  assert.match(caseMigration, /resolve_business_verification_review/);
  assert.match(caseMigration, /if not public\.is_admin\(\) then/);
  assert.match(caseMigration, /ABN_VERIFICATION_MANUAL_REVIEW_REQUESTED/);
  assert.match(caseMigration, /ABN_VERIFICATION_MANUAL_APPROVED/);
  assert.match(caseMigration, /ABN_VERIFICATION_MANUAL_REJECTED/);
  assert.match(flow, /requestBusinessVerificationReview/);
  assert.match(adminScreen, /APPROVE EXCEPTION/);
  assert.match(adminScreen, /REJECT EXCEPTION/);
});

test('RLS remains enabled for new verification attempt/review tables', () => {
  assert.match(migration, /alter table public\.abn_verification_attempts enable row level security/);
  assert.match(migration, /alter table public\.business_verification_reviews enable row level security/);
  assert.match(migration, /business_verification_reviews_participant_select/);
  assert.match(migration, /business_verification_reviews_admin_update/);
});

test('audit events are present for the automated lifecycle', () => {
  for (const event of [
    'ABN_VERIFICATION_SUBMITTED',
    'ABN_VERIFICATION_LOOKUP_SUCCESS',
    'ABN_VERIFICATION_AUTO_APPROVED',
    'ABN_VERIFICATION_AUTO_REJECTED',
    'ABN_VERIFICATION_RETRY',
    'ABN_VERIFICATION_MANUAL_REVIEW_REQUESTED',
    'ABN_VERIFICATION_MANUAL_APPROVED',
    'ABN_VERIFICATION_MANUAL_REJECTED',
  ]) {
    assert.match(migration + caseMigration, new RegExp(event));
  }
});

test('admin operations are exception-focused', () => {
  assert.match(adminScreen, /AUTOMATICALLY VERIFIED/);
  assert.match(adminScreen, /AUTOMATICALLY REJECTED/);
  assert.match(adminScreen, /PENDING RETRY/);
  assert.match(adminScreen, /MANUAL REVIEW PENDING/);
  assert.match(adminScreen, /SERVICE ERRORS/);
  assert.match(adminScreen, /business_verification_reviews/);
});
