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

test('admin MFA refreshes the session before creating a verification challenge', () => {
  const challengeStart = adminMfa.indexOf('export async function challengeAdminTotpFactor');
  const challengeEnd = adminMfa.indexOf('export async function verifyAdminTotp', challengeStart);
  assert.ok(challengeStart >= 0 && challengeEnd > challengeStart);
  const challengeBlock = adminMfa.slice(challengeStart, challengeEnd);
  assert.match(challengeBlock, /supabase\.auth\.refreshSession\(\)/);
  assert.match(challengeBlock, /supabase\.auth\.mfa\.challenge/);
});

test('admin MFA verification uses the exact stored factor and challenge without an automatic retry', () => {
  assert.match(adminMfa, /supabase\.auth\.mfa\.verify/);
  assert.doesNotMatch(adminMfa, /for\s*\(|while\s*\(|retry/i);
});

test('admin MFA captures safe Supabase challenge/verify diagnostics without secrets', () => {
  assert.doesNotMatch(adminMfa, /console\.(?:log|info|debug|warn|error)[\s\S]{0,300}(?:secret|uri)/i);
});

test('admin MFA exposes an explicit setup state machine and stale-factor recovery UX', () => {
  assert.match(adminScreen, /restart/i);
  assert.match(adminScreen, /MFA setup is incomplete/);
});

test('admin MFA creates the challenge only when the user submits a code', () => {
  assert.doesNotMatch(adminScreen, /useEffect\([\s\S]{0,500}mfa\.challenge/);
});

test('admin MFA does not persist the TOTP secret or URI', () => {
  assert.doesNotMatch(adminMfa, /localStorage\.(?:setItem|getItem)\([^)]*(?:secret|uri)/i);
  assert.doesNotMatch(adminMfa, /console\.(?:log|info|debug|warn|error)[\s\S]{0,300}(?:secret|uri)/i);
});

test('admin MFA post-sign-in challenge uses the current-factor helper', () => {
  assert.match(adminMfa, /export async function challengeAdminTotp\(code: string\)/);
  assert.match(adminMfa, /getVerifiedAdminTotpFactorId\(\)/);
  assert.match(adminScreen, /if\(!setup\)\{[\s\S]*challengeAdminTotp\(c\)/);
  assert.ok(adminScreen.includes('challengeAdminTotp(c)'));
});

test('admin MFA post-sign-in verification does not require enrollment state', () => {
  const gateStart = adminScreen.indexOf('function MfaGate');
  const gateEnd = adminScreen.indexOf('\nexport default function Admin', gateStart);
  const gate = adminScreen.slice(gateStart, gateEnd);
  const submitStart = gate.indexOf('async function submit()');
  const submitBlock = gate.slice(submitStart);
  const setupBranchStart = submitBlock.indexOf('if(setup&&!enrollment){');
  const setupBranchEnd = submitBlock.indexOf('if(!setup){', setupBranchStart);
  assert.ok(setupBranchStart >= 0 && setupBranchEnd > setupBranchStart);
  const setupOnlyBranch = submitBlock.slice(setupBranchStart, setupBranchEnd);
  assert.match(setupOnlyBranch, /MFA_FACTOR_NOT_FOUND/);
  assert.match(submitBlock.slice(setupBranchEnd), /if\(!setup\)\{[\s\S]*challengeAdminTotp\(c\)/);
  assert.doesNotMatch(submitBlock.slice(setupBranchEnd), /MFA_FACTOR_NOT_FOUND/);
});
