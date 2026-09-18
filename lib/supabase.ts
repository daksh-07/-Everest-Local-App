import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, processLock } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

class ExpoSecureStoreAdapter {
  async getItem(key: string) {
    if (Platform.OS === 'web') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  }

  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Browser storage is optional; Supabase can continue without persistence.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  }

  async removeItem(key: string) {
    if (Platform.OS === 'web') {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore unavailable browser storage.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  }
}

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url ?? 'https://placeholder.invalid',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: new ExpoSecureStoreAdapter(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
    global: { headers: { 'x-client-info': 'everest-local-mobile' } },
  },
);

export function requireSupabaseConfig() {
  if (!supabaseConfigured) throw new Error('Everest Local is not configured yet. Add the public Supabase environment variables.');
}
