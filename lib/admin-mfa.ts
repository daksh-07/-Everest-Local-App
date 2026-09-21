import { supabase, requireSupabaseConfig } from './supabase';
import { getMyAccessContext } from './access';

export type AdminMfaDiagnostic =
  | 'ENROLLMENT_FAILED'
  | 'QR_RENDER_FAILED'
  | 'MFA_CHALLENGE_CREATION_FAILED'
  | 'MFA_VERIFICATION_FAILED'
  | 'CHALLENGE_EXPIRED'
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
  readonly details?: AdminMfaDiagnosticDetails;
  constructor(diagnostic: AdminMfaDiagnostic, message: string, details?: AdminMfaDiagnosticDetails) {
    super(message);
    this.name = 'AdminMfaError';
    this.diagnostic = diagnostic;
    this.details = details;
  }
}

function diagnosticError(
  diagnostic: AdminMfaDiagnostic,
  fallbackMessage: string,
  error: unknown,
  phase: AdminMfaPhase,
  extra: Omit<AdminMfaDiagnosticDetails, 'phase' | 'code' | 'message' | 'status'> = {},
) {
  const details = authErrorDetails(error);
  return new AdminMfaError(diagnostic, details.message ?? fallbackMessage, {
    phase,
    ...details,
    ...extra,
  });
}

export type AdminMfaPhase = 'enrollment' | 'challenge' | 'verification' | 'refresh' | 'authorization';

export type AdminMfaDiagnosticDetails = {
  phase: AdminMfaPhase;
  code?: string;
  message?: string;
  status?: number;
  factorExists?: boolean;
  factorStatus?: string;
  factorType?: string;
  challengeCreated?: boolean;
  challengeIdExists?: boolean;
  aalBefore?: string | null;
  aalAfter?: string | null;
};

type AuthErrorLike = { code?: string; message?: string; status?: number };

function authErrorDetails(error: unknown): Pick<AdminMfaDiagnosticDetails, 'code' | 'message' | 'status'> {
  if (typeof error !== 'object' || error === null) return {};
  const value = error as AuthErrorLike;
  return {
    code: typeof value.code === 'string' && value.code ? value.code : undefined,
    message: typeof value.message === 'string' && value.message ? value.message : undefined,
    status: typeof value.status === 'number' ? value.status : undefined,
  };
}

function authErrorCode(error: unknown): string {
  return authErrorDetails(error).code ?? '';
}

function classifyMfaError(
  error: unknown,
  phase: AdminMfaPhase,
): AdminMfaDiagnostic {
  const code = authErrorCode(error);
  const message = (authErrorDetails(error).message ?? '').toLowerCase();

  if (code === 'mfa_factor_not_found') return 'MFA_FACTOR_NOT_FOUND';
  if (code === 'mfa_challenge_expired') return 'CHALLENGE_EXPIRED';
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled') return 'MFA_CONFIGURATION_ERROR';
  if (code === 'session_expired' || code === 'session_not_found' || code === 'refresh_token_not_found') return 'SESSION_EXPIRED';
  if (code === 'mfa_ip_address_mismatch') return phase === 'challenge' ? 'MFA_CHALLENGE_CREATION_FAILED' : 'MFA_VERIFICATION_FAILED';
  if (message.includes('network') || message.includes('fetch')) return 'NETWORK_FAILURE';
  if (message.includes('expired') || message.includes('session')) return 'SESSION_EXPIRED';
  if (message.includes('factor') && (message.includes('not found') || message.includes('unavailable'))) return 'MFA_FACTOR_NOT_FOUND';
  if (phase === 'enrollment') return 'ENROLLMENT_FAILED';
  if (phase === 'challenge') return 'MFA_CHALLENGE_CREATION_FAILED';
  if (phase === 'refresh') return 'SESSION_REFRESH_FAILED';
  if (phase === 'authorization') return 'ADMIN_AUTHORIZATION_FAILED';
  return 'MFA_VERIFICATION_FAILED';
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

export async function challengeAdminTotpFactor(factorId: string): Promise<{ challengeId: string; factorStatus: string; factorType: string; aalBefore: string | null }> {
  await assertAuthorizedAdmin();

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw diagnosticError('SESSION_REFRESH_FAILED', 'Your admin session could not be refreshed. Sign in again before verifying MFA.', refreshError, 'refresh', {
      factorExists: false,
      challengeCreated: false,
      challengeIdExists: false,
    });
  }

  const { data: assuranceBefore, error: assuranceBeforeError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceBeforeError) {
    throw diagnosticError(classifyMfaError(assuranceBeforeError, 'challenge'), 'The MFA assurance state could not be read before challenge creation.', assuranceBeforeError, 'challenge', {
      factorExists: false,
      challengeCreated: false,
      challengeIdExists: false,
    });
  }

  const factors = await listAllFactors();
  const factor = factors.find((item) => item.id === factorId && item.factor_type === 'totp') ?? null;
  if (!factor) {
    throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'The MFA setup factor is no longer available.', {
      phase: 'challenge',
      factorExists: false,
      challengeCreated: false,
      challengeIdExists: false,
      aalBefore: assuranceBefore.currentLevel,
    });
  }
  if (factor.status !== 'unverified' && factor.status !== 'verified') {
    throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'The MFA setup factor is no longer available.', {
      phase: 'challenge',
      factorExists: true,
      factorStatus: String(factor.status),
      factorType: String(factor.factor_type),
      challengeCreated: false,
      challengeIdExists: false,
      aalBefore: assuranceBefore.currentLevel,
    });
  }

  const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (error) {
    const diagnostic = classifyMfaError(error, 'challenge');
    throw diagnosticError(diagnostic, 'The MFA challenge could not be created.', error, 'challenge', {
      factorExists: true,
      factorStatus: String(factor.status),
      factorType: String(factor.factor_type),
      challengeCreated: false,
      challengeIdExists: false,
      aalBefore: assuranceBefore.currentLevel,
    });
  }
  if (!data?.id) {
    throw new AdminMfaError('MFA_CHALLENGE_CREATION_FAILED', 'Supabase did not return a challenge ID.', {
      phase: 'challenge',
      factorExists: true,
      factorStatus: String(factor.status),
      factorType: String(factor.factor_type),
      challengeCreated: false,
      challengeIdExists: false,
      aalBefore: assuranceBefore.currentLevel,
    });
  }
  return {
    challengeId: data.id,
    factorStatus: String(factor.status),
    factorType: String(factor.factor_type),
    aalBefore: assuranceBefore.currentLevel,
  };
}

export async function verifyAdminTotp(
  factorId: string,
  challengeId: string,
  code: string,
  aalBefore: string | null = null,
  factorStatus = 'unknown',
  factorType = 'totp',
) {
  if (!challengeId) {
    throw new AdminMfaError('CHALLENGE_EXPIRED', 'Your verification window expired. Enter the newest code from your authenticator, then press Verify again.', {
      phase: 'verification', factorExists: true, factorStatus, factorType,
      challengeCreated: false, challengeIdExists: false, aalBefore,
    });
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: code.trim(),
  });

  if (verifyError) {
    const diagnostic = classifyMfaError(verifyError, 'verification');
    const details: Omit<AdminMfaDiagnosticDetails, 'phase' | 'code' | 'message' | 'status'> = {
      factorExists: authErrorCode(verifyError) !== 'mfa_factor_not_found',
      factorStatus: authErrorCode(verifyError) === 'mfa_factor_not_found' ? 'missing' : factorStatus,
      factorType,
      challengeCreated: true,
      challengeIdExists: true,
      aalBefore,
    };
    if (diagnostic === 'CHALLENGE_EXPIRED') {
      throw diagnosticError(diagnostic, 'Your verification window expired. Enter the newest code from your authenticator, then press Verify again.', verifyError, 'verification', details);
    }
    throw diagnosticError('MFA_VERIFICATION_FAILED', 'Supabase rejected the MFA verification attempt.', verifyError, 'verification', details);
  }

  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw diagnosticError(classifyMfaError(assuranceError, 'verification'), 'The MFA assurance state could not be confirmed.', assuranceError, 'verification', {
      factorExists: true, factorStatus: 'verified', factorType,
      challengeCreated: true, challengeIdExists: true,
      aalBefore,
    });
  }

  if (assurance.currentLevel !== 'aal2') {
    throw new AdminMfaError('AAL2_NOT_ESTABLISHED', 'MFA verification succeeded but the session did not reach AAL2.', {
      phase: 'verification', factorExists: true, factorStatus: 'verified', factorType,
      challengeCreated: true, challengeIdExists: true,
      aalBefore, aalAfter: assurance.currentLevel,
    });
  }
}

export async function challengeAdminTotp(code: string) {
  const factorId = await getVerifiedAdminTotpFactorId();
  const challenge = await challengeAdminTotpFactor(factorId);
  return verifyAdminTotp(factorId, challenge.challengeId, code, challenge.aalBefore);
}

async function getVerifiedAdminTotpFactorId() {
  await assertAuthorizedAdmin();
  const factors = await listAllFactors();
  const factor = factors.find((item) => item.factor_type === 'totp' && item.status === 'verified');
  if (!factor) throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'Admin MFA setup is required.');
  return factor.id;
}
