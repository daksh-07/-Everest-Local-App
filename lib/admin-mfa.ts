import { supabase, requireSupabaseConfig } from './supabase';
import { getMyAccessContext } from './access';

export type AdminMfaDiagnostic =
  | 'ENROLLMENT_FAILED'
  | 'QR_RENDER_FAILED'
  | 'CHALLENGE_FAILED'
  | 'INVALID_TOTP'
  | 'VERIFICATION_FAILED'
  | 'AAL2_NOT_ESTABLISHED'
  | 'SESSION_REFRESH_FAILED'
  | 'ADMIN_AUTHORIZATION_FAILED'
  | 'SUPABASE_CONFIGURATION_ERROR'
  | 'SESSION_EXPIRED'
  | 'MFA_FACTOR_NOT_FOUND'
  | 'MFA_CONFIGURATION_ERROR'
  | 'NETWORK_FAILURE'
  | 'UNKNOWN';

export type AdminMfaState = {
  authorizedAdmin: boolean;
  aal: 'aal1' | 'aal2';
  hasVerifiedTotp: boolean;
  passwordAuthenticated: boolean;
};

export type AdminMfaSetup = {
  userId: string;
  factorId: string;
  challengeId: string;
};

export class AdminMfaError extends Error {
  readonly diagnostic: AdminMfaDiagnostic;
  constructor(diagnostic: AdminMfaDiagnostic, message: string) {
    super(message);
    this.name = 'AdminMfaError';
    this.diagnostic = diagnostic;
  }
}

type AuthErrorLike = { code?: string; message?: string };

function authErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as AuthErrorLike).code ?? '')
    : '';
}

function classifyMfaError(
  error: unknown,
  phase: 'enrollment' | 'challenge' | 'verification' | 'refresh' | 'authorization',
): AdminMfaDiagnostic {
  const code = authErrorCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (code === 'mfa_factor_not_found') return 'MFA_FACTOR_NOT_FOUND';
  if (code === 'mfa_challenge_expired') return 'CHALLENGE_FAILED';
  if (code === 'mfa_verification_failed') return 'INVALID_TOTP';
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled') return 'MFA_CONFIGURATION_ERROR';
  if (code === 'session_expired' || code === 'session_not_found' || code === 'refresh_token_not_found') return 'SESSION_EXPIRED';
  if (code === 'mfa_ip_address_mismatch') return 'CHALLENGE_FAILED';
  if (message.includes('network') || message.includes('fetch')) return 'NETWORK_FAILURE';
  if (message.includes('expired') || message.includes('session')) return 'SESSION_EXPIRED';
  if (message.includes('factor') && (message.includes('not found') || message.includes('unavailable'))) return 'MFA_FACTOR_NOT_FOUND';
  if (message.includes('verification') && (message.includes('failed') || message.includes('invalid') || message.includes('code'))) {
    return phase === 'verification' ? 'INVALID_TOTP' : 'VERIFICATION_FAILED';
  }
  if (phase === 'enrollment') return 'ENROLLMENT_FAILED';
  if (phase === 'challenge') return 'CHALLENGE_FAILED';
  if (phase === 'refresh') return 'SESSION_REFRESH_FAILED';
  if (phase === 'authorization') return 'ADMIN_AUTHORIZATION_FAILED';
  return 'UNKNOWN';
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new AdminMfaError('SESSION_EXPIRED', 'Your admin session has expired. Sign in again.');
  }
  return data.user.id;
}

async function assertAuthorizedAdmin(): Promise<string> {
  try {
    requireSupabaseConfig();
    const access = await getMyAccessContext();
    if (!access.is_authorized_admin) {
      throw new AdminMfaError('ADMIN_AUTHORIZATION_FAILED', 'Admin authorization is required.');
    }
    return await currentUserId();
  } catch (error) {
    if (error instanceof AdminMfaError) throw error;
    throw new AdminMfaError(classifyMfaError(error, 'authorization'), 'Admin authorization could not be confirmed.');
  }
}

async function listAllFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.all;
}

async function findExactFactor(factorId: string) {
  const factors = await listAllFactors();
  return factors.find((factor) => factor.id === factorId && factor.factor_type === 'totp') ?? null;
}

export async function getAdminMfaState(): Promise<AdminMfaState> {
  requireSupabaseConfig();
  const access = await getMyAccessContext();
  if (!access.is_authorized_admin) {
    return { authorizedAdmin: false, aal: 'aal1', hasVerifiedTotp: false, passwordAuthenticated: false };
  }

  const { data: authState, error: authStateError } = await supabase.rpc('get_admin_auth_state');
  if (authStateError) {
    throw new AdminMfaError(classifyMfaError(authStateError, 'authorization'), 'Admin authentication state could not be read.');
  }

  const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aalError) throw new AdminMfaError(classifyMfaError(aalError, 'authorization'), 'Authenticator assurance state could not be read.');
  if (factorsError) throw new AdminMfaError(classifyMfaError(factorsError, 'authorization'), 'MFA factor state could not be read.');

  return {
    authorizedAdmin: true,
    aal: aal.currentLevel === 'aal2' ? 'aal2' : 'aal1',
    hasVerifiedTotp: factors.all.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified'),
    passwordAuthenticated: authState?.password_authenticated === true,
  };
}

export async function listAbandonedAdminTotpFactors() {
  await assertAuthorizedAdmin();
  const factors = await listAllFactors();
  return factors.filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified').map((factor) => factor.id);
}

export async function unenrollAdminTotp(factorId: string) {
  await assertAuthorizedAdmin();
  const factor = await findExactFactor(factorId);
  if (!factor) return;
  if (String(factor.status) === 'verified') {
    throw new AdminMfaError('ADMIN_AUTHORIZATION_FAILED', 'A verified admin MFA factor cannot be removed from setup.');
  }

  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (unenrollError) {
    throw new AdminMfaError(classifyMfaError(unenrollError, 'enrollment'), 'MFA setup could not be restarted.');
  }

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw new AdminMfaError('SESSION_REFRESH_FAILED', 'The session could not be refreshed after MFA cleanup.');
  }
}

export async function restartAdminTotpSetup(activeFactorId?: string) {
  await assertAuthorizedAdmin();
  const factors = await listAllFactors();
  const candidates = factors.filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified');
  const targets = activeFactorId
    ? candidates.filter((factor) => factor.id === activeFactorId)
    : candidates;

  for (const factor of targets) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      throw new AdminMfaError(classifyMfaError(error, 'enrollment'), 'MFA setup could not be restarted.');
    }
  }

  if (targets.length > 0) {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw new AdminMfaError('SESSION_REFRESH_FAILED', 'The session could not be refreshed after MFA cleanup.');
  }
}

export async function enrollAdminTotp() {
  const userId = await assertAuthorizedAdmin();

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Everest Local Admin',
  });
  if (error) {
    throw new AdminMfaError(classifyMfaError(error, 'enrollment'), 'TOTP enrollment could not be started.');
  }
  if (!data?.id || !data.totp?.qr_code || !data.totp.secret || !data.totp.uri) {
    throw new AdminMfaError('QR_RENDER_FAILED', 'Supabase returned an incomplete TOTP enrollment payload.');
  }

  const afterUserId = await currentUserId();
  if (afterUserId !== userId) {
    throw new AdminMfaError('SESSION_EXPIRED', 'The admin session changed during MFA setup. Start a fresh setup.');
  }

  return { ...data, userId };
}

export async function challengeAdminTotpFactor(factorId: string): Promise<string> {
  const userId = await assertAuthorizedAdmin();
  const factor = await findExactFactor(factorId);
  if (!factor) throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'The MFA setup factor is no longer available.');
  if (factor.status !== 'unverified' && factor.status !== 'verified') {
    throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'The MFA setup factor is no longer available.');
  }

  const current = await currentUserId();
  if (current !== userId) throw new AdminMfaError('SESSION_EXPIRED', 'The admin session changed during MFA setup.');

  const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (error) throw new AdminMfaError(classifyMfaError(error, 'challenge'), 'The MFA challenge could not be created.');
  return data.id;
}

export async function verifyAdminTotp(factorId: string, challengeId: string, code: string) {
  const userId = await assertAuthorizedAdmin();
  const factor = await findExactFactor(factorId);
  if (!factor) {
    throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'Your MFA setup expired before verification. Start a new setup.');
  }

  const current = await currentUserId();
  if (current !== userId) {
    throw new AdminMfaError('SESSION_EXPIRED', 'The admin session changed during MFA setup. Start a fresh setup.');
  }

  let verify = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId,
    code: code.trim(),
  });

  if (verify.error && authErrorCode(verify.error) === 'mfa_challenge_expired') {
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) {
      throw new AdminMfaError(classifyMfaError(challenge.error, 'challenge'), 'The MFA challenge could not be recreated.');
    }
    verify = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
  }

  if (verify.error) {
    throw new AdminMfaError(classifyMfaError(verify.error, 'verification'), 'The MFA code was rejected.');
  }

  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new AdminMfaError(classifyMfaError(assuranceError, 'verification'), 'The MFA assurance state could not be confirmed.');
  }

  if (assurance.currentLevel !== 'aal2') {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw new AdminMfaError('SESSION_REFRESH_FAILED', 'The session could not be refreshed after MFA verification.');

    const { data: refreshed, error: refreshedError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (refreshedError) throw new AdminMfaError(classifyMfaError(refreshedError, 'refresh'), 'The refreshed MFA assurance state could not be read.');
    if (refreshed?.currentLevel !== 'aal2') {
      throw new AdminMfaError('AAL2_NOT_ESTABLISHED', 'MFA verification succeeded but the session did not reach AAL2.');
    }
  }
}

export async function challengeAdminTotp(code: string) {
  const factorId = await getVerifiedAdminTotpFactorId();
  const challengeId = await challengeAdminTotpFactor(factorId);
  return verifyAdminTotp(factorId, challengeId, code);
}

async function getVerifiedAdminTotpFactorId() {
  await assertAuthorizedAdmin();
  const factors = await listAllFactors();
  const factor = factors.find((item) => item.factor_type === 'totp' && item.status === 'verified');
  if (!factor) throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'Admin MFA setup is required.');
  return factor.id;
}
