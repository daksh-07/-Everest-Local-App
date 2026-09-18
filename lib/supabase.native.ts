import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, processLock } from '@supabase/supabase-js';

const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  'https://bmwbljefnamvjnmuvkvv.supabase.co';
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_evkp_gHdu3ucFI82P8VLCw_vCjR2M2S';

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
    throw new Error(
      'Everest Local is not configured yet. Add the public Supabase environment variables.',
    );
  }
}
