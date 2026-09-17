import { supabase, requireSupabaseConfig } from './supabase';

export async function createServiceCheckout(bookingId:string){
  requireSupabaseConfig();
  const id=bookingId.trim();
  if(!id)throw new Error('Booking reference is required.');
  const idempotencyKey=crypto.randomUUID();
  const {data,error}=await supabase.functions.invoke('service-checkout',{
    body:{booking_id:id},
    headers:{'Idempotency-Key':idempotencyKey},
  });
  if(error)throw new Error(error.message);
  const result=data as {checkoutUrl?:unknown};
  if(typeof result.checkoutUrl!=='string'||!result.checkoutUrl)throw new Error('Service checkout did not return a payment link.');
  return result.checkoutUrl;
}
