// Fallback for tooling that does not apply Expo platform resolution.
// Metro resolves ./supabase to supabase.web.ts on web and supabase.native.ts on native.
export * from './supabase.web';
