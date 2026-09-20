import { supabase, requireSupabaseConfig } from './supabase';
import { getMyAccessContext } from './access';

export type AdminMfaState = {
  authorizedAdmin: boolean;
  aal: 'aal1' | 'aal2';
  hasVerifiedTotp: boolean;
  passwordAuthenticated: boolean;
};

async function assertAuthorizedAdmin() {
  requireSupabaseConfig();
  const access = await getMyAccessContext();
  if (!access.is_authorized_admin) throw new Error('Unauthorized');
}

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
  if (error) throw new Error(error.message);
  const factor = factors.totp.find((item) => item.id === factorId);
  if (!factor) return;
  if (factor.status === 'verified') {
    throw new Error('A verified admin MFA factor cannot be removed from setup.');
  }
  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (unenrollError) throw new Error(unenrollError.message);
  await supabase.auth.refreshSession();
}

export async function enrollAdminTotp() {
  await assertAuthorizedAdmin();

  // A failed/abandoned enrollment leaves an unverified factor behind.
  // Remove only those incomplete factors so setup can be safely restarted.
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw new Error(factorsError.message);
  for (const factor of factors.totp) {
    if (factor.status === 'unverified') {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw new Error(error.message);
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Everest Local Admin',
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function verifyAdminTotp(factorId: string, code: string) {
  await assertAuthorizedAdmin();
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw new Error(factorsError.message);
  const factor = factors.totp.find((item) => item.id === factorId);
  if (!factor) throw new Error('MFA factor unavailable.');
  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) throw new Error(challenge.error.message);
  const verify = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verify.error) throw new Error(verify.error.message);
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw new Error(assuranceError.message);
  if (assurance.currentLevel !== 'aal2') {
    await supabase.auth.refreshSession();
    const { data: refreshed } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (refreshed.currentLevel !== 'aal2') throw new Error('MFA verification did not establish the required assurance level.');
  }
  await supabase.auth.refreshSession();
}

export async function challengeAdminTotp(code: string) {
  return verifyAdminTotp(await getVerifiedAdminTotpFactorId(), code);
}

async function getVerifiedAdminTotpFactorId() {
  await assertAuthorizedAdmin();
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const factor = factors.totp.find((item) => item.status === 'verified');
  if (!factor) throw new Error('Admin MFA setup is required.');
  return factor.id;
}
