import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient, processLock } from '@supabase/supabase-js';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: unknown;
  supabaseAnonKey?: unknown;
};
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const configuredAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const url = configuredUrl || (typeof extra.supabaseUrl === 'string' ? extra.supabaseUrl.trim() : '');
const anonKey = configuredAnonKey || (typeof extra.supabaseAnonKey === 'string' ? extra.supabaseAnonKey.trim() : '');

const nativeStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: nativeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
  global: { headers: { 'x-client-info': 'everest-local-mobile' } },
});

export function requireSupabaseConfig() {
  if (!supabaseConfigured) {
    throw new Error('Everest Local is not configured yet. Add the public Supabase environment variables.');
  }
}
