import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { supabaseStorage } from './supabase.storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url ?? 'https://placeholder.invalid',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: supabaseStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
    global: { headers: { 'x-client-info': 'everest-local-mobile' } },
  },
);

export function requireSupabaseConfig() {
  if (!supabaseConfigured) {
    throw new Error('Everest Local is not configured yet. Add the public Supabase environment variables.');
  }
}
