import { supabase, requireSupabaseConfig } from './supabase';

export type AccessContext = {
  profile_role: 'CUSTOMER' | 'BUSINESS' | 'ADMIN' | 'DELIVERY_DRIVER' | null;
  business_id: string | null;
  business_name: string | null;
  business_status: 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | null;
  business_verification_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | null;
  driver_application_status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | null;
  is_business_member: boolean;
  is_verified_business: boolean;
  is_active_driver: boolean;
  is_admin: boolean;
};

export async function getMyAccessContext(): Promise<AccessContext> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('get_my_access_context');
  if (error) throw new Error(error.message);
  return data as AccessContext;
}

export async function resolvePostAuthRoute(intent: 'CUSTOMER' | 'BUSINESS' | 'DELIVERY_DRIVER'): Promise<string> {
  const access = await getMyAccessContext();

  if (intent === 'BUSINESS') {
    if (!access.is_business_member) return '/business-onboarding';
    return '/business-dashboard';
  }

  if (intent === 'DELIVERY_DRIVER') {
    if (access.is_active_driver) return '/delivery';
    return '/driver-onboarding';
  }

  return '/';
}
