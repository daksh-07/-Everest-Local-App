import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const browserStorage={getItem:(key:string)=>{if(typeof window==='undefined')return null;try{return window.localStorage.getItem(key)}catch{return null}},setItem:(key:string,value:string)=>{if(typeof window==='undefined')return;try{window.localStorage.setItem(key,value)}catch{return}},removeItem:(key:string)=>{if(typeof window==='undefined')return;try{window.localStorage.removeItem(key)}catch{return}}};
export const supabaseConfigured=Boolean(url&&anonKey);
export const supabase=createClient(url??'https://placeholder.invalid',anonKey??'placeholder-anon-key',{auth:{storage:browserStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:processLock},global:{headers:{'x-client-info':'everest-local-web'}}});
export function requireSupabaseConfig(){if(!supabaseConfigured)throw new Error('Everest Local is not configured yet. Add the public Supabase environment variables.');}
