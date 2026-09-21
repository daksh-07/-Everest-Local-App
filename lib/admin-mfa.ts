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

export class AdminMfaError extends Error {
  readonly diagnostic: AdminMfaDiagnostic;
  constructor(diagnostic: AdminMfaDiagnostic, message: string) {
    super(message);
    this.name = 'AdminMfaError';
    this.diagnostic = diagnostic;
  }
}

function classifyMfaError(error: unknown, phase: 'enrollment' | 'challenge' | 'verification' | 'refresh' | 'authorization'): AdminMfaDiagnostic {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('network') || message.includes('fetch')) return 'NETWORK_FAILURE';
  if (message.includes('expired') || message.includes('session')) return 'SESSION_EXPIRED';
  if (message.includes('totp_enroll_not_enabled') || message.includes('totp_verify_not_enabled') || message.includes('verification disabled') || message.includes('enrollment disabled')) return 'MFA_CONFIGURATION_ERROR';
  if (message.includes('factor') && (message.includes('not found') || message.includes('unavailable'))) return 'MFA_FACTOR_NOT_FOUND';
  if (message.includes('verification') && (message.includes('failed') || message.includes('invalid') || message.includes('code'))) return phase === 'verification' ? 'INVALID_TOTP' : 'VERIFICATION_FAILED';
  if (phase === 'enrollment') return 'ENROLLMENT_FAILED';
  if (phase === 'challenge') return 'CHALLENGE_FAILED';
  if (phase === 'refresh') return 'SESSION_REFRESH_FAILED';
  if (phase === 'authorization') return 'ADMIN_AUTHORIZATION_FAILED';
  return 'UNKNOWN';
}

async function assertAuthorizedAdmin() {
  try {
    requireSupabaseConfig();
    const access = await getMyAccessContext();
    if (!access.is_authorized_admin) throw new AdminMfaError('ADMIN_AUTHORIZATION_FAILED', 'Admin authorization is required.');
  } catch (error) {
    if (error instanceof AdminMfaError) throw error;
    throw new AdminMfaError(classifyMfaError(error, 'authorization'), 'Admin authorization could not be confirmed.');
  }
}

export async function getAdminMfaState(): Promise<AdminMfaState> {
  requireSupabaseConfig();
  const access = await getMyAccessContext();
  if (!access.is_authorized_admin) return { authorizedAdmin: false, aal: 'aal1', hasVerifiedTotp: false, passwordAuthenticated: false };
  const { data: authState, error: authStateError } = await supabase.rpc('get_admin_auth_state');
  if (authStateError) throw new AdminMfaError(classifyMfaError(authStateError, 'authorization'), 'Admin authentication state could not be read.');
  const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aalError) throw new AdminMfaError(classifyMfaError(aalError, 'authorization'), 'Authenticator assurance state could not be read.');
  if (factorsError) throw new AdminMfaError(classifyMfaError(factorsError, 'authorization'), 'MFA factor state could not be read.');
  return {
    authorizedAdmin: true,
    aal: aal.currentLevel === 'aal2' ? 'aal2' : 'aal1',
    hasVerifiedTotp: factors.totp.some((factor) => factor.status === 'verified'),
    passwordAuthenticated: authState?.password_authenticated === true,
  };
}

export async function unenrollAdminTotp(factorId: string) {
  await assertAuthorizedAdmin();
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new AdminMfaError(classifyMfaError(error, 'enrollment'), 'MFA factor state could not be read.');
  const factor = factors.totp.find((item) => item.id === factorId);
  if (!factor) return;
  if (String(factor.status) === 'verified') {
    throw new AdminMfaError('ADMIN_AUTHORIZATION_FAILED', 'A verified admin MFA factor cannot be removed from setup.');
  }
  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (unenrollError) throw new AdminMfaError(classifyMfaError(unenrollError, 'enrollment'), 'MFA setup could not be restarted.');
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw new AdminMfaError('SESSION_REFRESH_FAILED', 'The session could not be refreshed after MFA cleanup.');
}

export async function enrollAdminTotp() {
  await assertAuthorizedAdmin();
  // Enrollment is deliberately non-destructive. An incomplete factor belongs to the
  // current setup attempt and must remain stable until the user explicitly restarts.
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Everest Local Admin',
  });
  if (error) throw new AdminMfaError(classifyMfaError(error, 'enrollment'), 'TOTP enrollment could not be started.');
  return data;
}

export async function verifyAdminTotp(factorId: string, code: string) {
  await assertAuthorizedAdmin();
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw new AdminMfaError(classifyMfaError(factorsError, 'verification'), 'MFA factor state could not be read.');
  const factor = factors.totp.find((item) => item.id === factorId);
  if (!factor) throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'The MFA setup factor is no longer available.');
  if (String(factor.status) === 'verified') {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel === 'aal2') return;
  }
  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) throw new AdminMfaError(classifyMfaError(challenge.error, 'challenge'), 'The MFA challenge could not be created.');
  const verify = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verify.error) throw new AdminMfaError(classifyMfaError(verify.error, 'verification'), 'The MFA code was rejected.');
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw new AdminMfaError(classifyMfaError(assuranceError, 'verification'), 'The MFA assurance state could not be confirmed.');
  if (assurance.currentLevel !== 'aal2') {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw new AdminMfaError('SESSION_REFRESH_FAILED', 'The session could not be refreshed after MFA verification.');
    const { data: refreshed, error: refreshedError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (refreshedError) throw new AdminMfaError(classifyMfaError(refreshedError, 'refresh'), 'The refreshed MFA assurance state could not be read.');
    if (refreshed?.currentLevel !== 'aal2') throw new AdminMfaError('AAL2_NOT_ESTABLISHED', 'MFA verification succeeded but the session did not reach AAL2.');
  }
}

export async function challengeAdminTotp(code: string) {
  return verifyAdminTotp(await getVerifiedAdminTotpFactorId(), code);
}

async function getVerifiedAdminTotpFactorId() {
  await assertAuthorizedAdmin();
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new AdminMfaError(classifyMfaError(error, 'challenge'), 'MFA factor state could not be read.');
  const factor = factors.totp.find((item) => item.status === 'verified');
  if (!factor) throw new AdminMfaError('MFA_FACTOR_NOT_FOUND', 'Admin MFA setup is required.');
  return factor.id;
}
