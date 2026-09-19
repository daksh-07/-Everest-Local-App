import { Platform, Linking } from 'react-native';
import { supabase, requireSupabaseConfig } from './supabase';
import { z } from 'zod';

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(8).max(128);

function passwordResetRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth${intent ? `?intent=${encodeURIComponent(intent)}` : ''}`;
  }
  return `everestlocal://auth${intent ? `?intent=${encodeURIComponent(intent)}` : ''}`;
}

function oauthRedirect(intent?: 'CUSTOMER' | 'BUSINESS' | 'DELIVERY_DRIVER') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth`;
  }
  return 'everestlocal://auth';
}

export async function signInWithProvider(provider: 'google' | 'apple', intent?: 'CUSTOMER' | 'BUSINESS' | 'DELIVERY_DRIVER') {
  requireSupabaseConfig();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthRedirect(intent),
      skipBrowserRedirect: Platform.OS !== 'web',
    },
  });
  if (error) throw new Error(error.message);
  if (Platform.OS !== 'web' && data.url) {
    await Linking.openURL(data.url);
  }
  return data;
}

export async function createNativeOAuthSession(url: string) {
  requireSupabaseConfig();
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    return data.session;
  }

  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signUp(email:string,password:string,fullName:string){
  requireSupabaseConfig();
  const parsed=emailSchema.safeParse(email);
  if(!parsed.success)throw new Error('Enter a valid email address.');
  const validPassword=passwordSchema.safeParse(password);
  if(!validPassword.success)throw new Error('Password must be 8–128 characters.');
  if(fullName.trim().length<2||fullName.trim().length>120)throw new Error('Enter your full name.');
  const {data,error}=await supabase.auth.signUp({email:parsed.data.toLowerCase(),password:validPassword.data,options:{data:{full_name:fullName.trim()}}});
  if(error)throw new Error(error.message);
  return data;
}

export async function signIn(email:string,password:string){
  requireSupabaseConfig();
  const parsed=emailSchema.safeParse(email);
  if(!parsed.success)throw new Error('Enter a valid email address.');
  const validPassword=passwordSchema.safeParse(password);
  if(!validPassword.success)throw new Error('Password must be 8–128 characters.');
  const {data,error}=await supabase.auth.signInWithPassword({email:parsed.data.toLowerCase(),password:validPassword.data});
  if(error)throw new Error(error.message);
  return data;
}

export async function signOut(){
  requireSupabaseConfig();
  const {error}=await supabase.auth.signOut();
  if(error)throw new Error(error.message);
}

export async function requestPasswordReset(email:string){
  requireSupabaseConfig();
  const parsed=emailSchema.safeParse(email);
  if(!parsed.success)throw new Error('Enter a valid email address.');
  const {error}=await supabase.auth.resetPasswordForEmail(parsed.data.toLowerCase(),{redirectTo:passwordResetRedirect()});
  if(error)throw new Error(error.message);
}

export async function exchangePasswordRecoveryCode(code:string){
  requireSupabaseConfig();
  const normalized=code.trim();
  if(!normalized)throw new Error('Password reset link is invalid or incomplete.');
  const {error}=await supabase.auth.exchangeCodeForSession(normalized);
  if(error)throw new Error(error.message);
}

export async function updatePassword(password:string){
  requireSupabaseConfig();
  const validPassword=passwordSchema.safeParse(password);
  if(!validPassword.success)throw new Error('Password must be 8–128 characters.');
  const {error}=await supabase.auth.updateUser({password:validPassword.data});
  if(error)throw new Error(error.message);
}

export async function deleteOwnAccount(){
  requireSupabaseConfig();
  const {error}=await supabase.functions.invoke('account-delete',{method:'POST'});
  if(error)throw new Error(error.message);
}
