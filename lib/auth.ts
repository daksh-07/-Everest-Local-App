import { supabase, requireSupabaseConfig } from './supabase';

export async function signUp(email: string, password: string, fullName: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: fullName.trim() } } });
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email: string, password: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  requireSupabaseConfig();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function requestPasswordReset(email: string) {
  requireSupabaseConfig();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw new Error(error.message);
}

export async function deleteOwnAccount() {
  // Account deletion requires a trusted server function; clients must never receive service-role credentials.
  requireSupabaseConfig();
  const { error } = await supabase.functions.invoke('account-delete', { method: 'POST' });
  if (error) throw new Error(error.message);
}
