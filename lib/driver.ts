import { supabase, requireSupabaseConfig } from './supabase';

export type DriverApplication = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  full_name: string | null;
  phone: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  service_area: string;
  vehicle_type: string;
  vehicle_registration: string;
  availability: string;
  notes: string | null;
  admin_notes: string | null;
};

export async function getDriverApplication(): Promise<DriverApplication | null> {
  requireSupabaseConfig();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: application, error } = await supabase
    .from('driver_applications')
    .select('id,status,suburb,city,state,service_area,vehicle_type,vehicle_registration,availability,notes,admin_notes')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name,phone')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!application) return null;

  return { ...application, full_name: profile?.full_name ?? null, phone: profile?.phone ?? null } as DriverApplication;
}

export async function createDriverApplication(input: {
  fullName: string;
  phone: string;
  suburb: string;
  city: string;
  state: string;
  serviceArea: string;
  vehicleType: string;
  vehicleRegistration: string;
  availability: string;
  notes?: string;
}) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('create_driver_application', {
    p_full_name: input.fullName.trim(),
    p_phone: input.phone.trim(),
    p_suburb: input.suburb.trim(),
    p_city: input.city.trim(),
    p_state: input.state.trim(),
    p_service_area: input.serviceArea.trim(),
    p_vehicle_type: input.vehicleType.trim(),
    p_vehicle_registration: input.vehicleRegistration.trim(),
    p_availability: input.availability.trim(),
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Driver application returned an invalid reference.');
  return data;
}
