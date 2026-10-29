import { userFacingError } from './errors';
import { supabase, requireSupabaseConfig } from './supabase';

function idempotencyKey(){return `service-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;}
function isStripeCheckoutUrl(value:string){
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&url.username===''&&url.password==='';
  }catch{return false;}
}

export async function createServiceCheckout(bookingId:string){
  requireSupabaseConfig();
  const id=bookingId.trim();
  if(!id)throw new Error('Booking reference is required.');
  const {data,error}=await supabase.functions.invoke('service-checkout',{
    body:{booking_id:id},
    headers:{'Idempotency-Key':idempotencyKey()},
  });
  if(error)throw new Error(userFacingError(error,'Payment could not be started. Please try again.'));
  if(!data||typeof data!=='object')throw new Error('Payment could not be started. Please try again.');
  const result=data as {checkoutUrl?:unknown;checkoutState?:unknown};
  if(result.checkoutUrl===null&&result.checkoutState==='COMPLETE')throw new Error('Checkout has completed. Refresh this booking to check the server-confirmed payment status.');
  if(result.checkoutUrl===null&&result.checkoutState==='EXPIRED')throw new Error('That checkout expired. No payment was confirmed for that attempt. Tap Pay again to start a new secure checkout.');
  if(typeof result.checkoutUrl!=='string'||!isStripeCheckoutUrl(result.checkoutUrl))throw new Error('Payment could not be started. Please try again.');
  return result.checkoutUrl;
}
