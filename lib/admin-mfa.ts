import { supabase, requireSupabaseConfig } from './supabase';
import { getMyAccessContext } from './access';

export type AdminMfaState = {
  authorizedAdmin: boolean;
  aal: 'aal1' | 'aal2';
  hasVerifiedTotp: boolean;
  passwordAuthenticated: boolean;
};

export async function getAdminMfaState(): Promise<AdminMfaState> {
  requireSupabaseConfig();
  const access = await getMyAccessContext();
  if (!access.is_authorized_admin) return { authorizedAdmin: false, aal: 'aal1', hasVerifiedTotp: false, passwordAuthenticated: false };
  const { data: authState, error: authStateError } = await supabase.rpc('get_admin_auth_state');
  if (authStateError) throw new Error(authStateError.message);
  const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aalError) throw new Error(aalError.message);
  if (factorsError) throw new Error(factorsError.message);
  return { authorizedAdmin: true, aal: aal.currentLevel === 'aal2' ? 'aal2' : 'aal1', hasVerifiedTotp: factors.totp.some((factor) => factor.status === 'verified'), passwordAuthenticated: authState?.password_authenticated === true };
}

export async function enrollAdminTotp() {
  requireSupabaseConfig();
  const access = await getMyAccessContext();
  if (!access.is_authorized_admin) throw new Error('Unauthorized');
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Everest Local Admin' });
  if (error) throw new Error(error.message);
  return data;
}

export async function verifyAdminTotp(factorId: string, code: string) {
  requireSupabaseConfig();
  const access = await getMyAccessContext();
  if (!access.is_authorized_admin) throw new Error('Unauthorized');
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw new Error(factorsError.message);
  const factor = factors.totp.find((item) => item.id === factorId);
  if (!factor) throw new Error('MFA factor unavailable.');
  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) throw new Error(challenge.error.message);
  const verify = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: code.trim() });
  if (verify.error) throw new Error(verify.error.message);
  await supabase.auth.refreshSession();
}

export async function challengeAdminTotp(code: string) {
  return verifyAdminTotp(await getVerifiedAdminTotpFactorId(), code);
}

async function getVerifiedAdminTotpFactorId() {
  requireSupabaseConfig();
  const access = await getMyAccessContext();
  if (!access.is_authorized_admin) throw new Error('Unauthorized');
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const factor = factors.totp.find((item) => item.status === 'verified');
  if (!factor) throw new Error('Admin MFA setup is required.');
  return factor.id;
}
