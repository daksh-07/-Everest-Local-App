import { supabase, requireSupabaseConfig } from './supabase';
import type { MarketplaceBusiness, Product, Quote, ServiceRequest } from './types';

export async function currentUser() {
  requireSupabaseConfig();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user;
}

export async function getProfile() {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function searchBusinesses(query: string, suburb?: string): Promise<MarketplaceBusiness[]> {
  requireSupabaseConfig();
  let request = supabase.from('businesses').select('id,name,slug,description,logo_url,category_id,verification_status,suburb,city,state').eq('status','ACTIVE').eq('verification_status','VERIFIED').limit(30);
  if (query.trim()) request = request.ilike('name', `%${query.trim()}%`);
  if (suburb?.trim()) request = request.ilike('suburb', suburb.trim());
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketplaceBusiness[];
}

export async function searchProducts(query: string): Promise<Product[]> {
  requireSupabaseConfig();
  let request = supabase.from('products').select('*').eq('status','ACTIVE').limit(30);
  if (query.trim()) request = request.or(`name.ilike.%${query.trim()}%,description.ilike.%${query.trim()}%`);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function createServiceRequest(input: {
  categoryId?: string; serviceId?: string; description: string; suburb: string; city: string; state: string;
  preferredDate?: string; preferredTime?: string; budget?: number; mediaUrls?: string[];
}) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('create_service_request', {
    p_category_id: input.categoryId ?? null, p_service_id: input.serviceId ?? null,
    p_description: input.description, p_suburb: input.suburb, p_city: input.city, p_state: input.state,
    p_preferred_date: input.preferredDate ?? null, p_preferred_time: input.preferredTime ?? null,
    p_budget: input.budget ?? null, p_media_urls: input.mediaUrls ?? [],
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function myRequests(): Promise<ServiceRequest[]> {
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('service_requests').select('*').eq('customer_id', user.id).order('created_at',{ascending:false});
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceRequest[];
}

export async function myQuotes(): Promise<Quote[]> {
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('quotes').select('*').eq('customer_id', user.id).order('created_at',{ascending:false});
  if (error) throw new Error(error.message);
  return (data ?? []) as Quote[];
}

export async function acceptQuote(quoteId: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('accept_quote',{p_quote_id:quoteId});
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateBookingStatus(bookingId: string, nextStatus: 'REQUESTED'|'PENDING_PAYMENT'|'CONFIRMED'|'UPCOMING'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'|'DISPUTED') {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('update_booking_status',{p_booking_id:bookingId,p_next:nextStatus});
  if (error) throw new Error(error.message);
  return Boolean(data);
}
