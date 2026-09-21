import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adminMfa = await readFile('lib/admin-mfa.ts', 'utf8');
const adminScreen = await readFile('app/admin.tsx', 'utf8');

test('admin MFA resolves the enrolled factor from listFactors().all', () => {
  assert.match(adminMfa, /data\.all/);
  assert.match(adminMfa, /factor\.factor_type === 'totp'/);
  assert.doesNotMatch(adminMfa, /factors\.totp\.find\(\(item\) => item\.id === factorId/);
});

test('admin MFA enrollment is non-destructive until explicit restart', () => {
  const enrollStart = adminMfa.indexOf('export async function enrollAdminTotp');
  const enrollEnd = adminMfa.indexOf('export async function challengeAdminTotpFactor', enrollStart);
  assert.ok(enrollStart >= 0 && enrollEnd > enrollStart);
  const enrollmentBlock = adminMfa.slice(enrollStart, enrollEnd);
  assert.doesNotMatch(enrollmentBlock, /mfa\.unenroll/);
  assert.match(enrollmentBlock, /mfa\.enroll/);
});

test('admin MFA verification uses the exact stored factor and challenge', () => {
  assert.match(adminMfa, /verifyAdminTotp\(factorId: string, challengeId: string, code: string\)/);
  assert.match(adminMfa, /mfa\.verify\(\{[\s\S]*factorId: factor\.id,[\s\S]*challengeId/);
  assert.match(adminMfa, /mfa_factor_not_found/);
});

test('admin MFA exposes an explicit setup state machine and stale-factor recovery UX', () => {
  for (const state of ['IDLE','ENROLLING','ENROLLED','AWAITING_CODE','VERIFYING','VERIFIED','COMPLETE']) {
    assert.match(adminScreen, new RegExp("'" + state + "'"));
  }
  assert.match(adminScreen, /Your MFA setup expired before verification\. Start a new setup\./);
  assert.match(adminScreen, /RESTART MFA SETUP/);
});

test('admin MFA does not persist the TOTP secret or URI', () => {
  assert.doesNotMatch(adminScreen, /localStorage\.(?:setItem|getItem)\([^)]*(?:secret|uri)/i);
  assert.doesNotMatch(adminMfa, /localStorage\.(?:setItem|getItem)\([^)]*(?:secret|uri)/i);
  assert.doesNotMatch(adminMfa, /console\.(?:log|info|debug|warn|error)[\s\S]{0,300}(?:secret|uri)/i);
});
