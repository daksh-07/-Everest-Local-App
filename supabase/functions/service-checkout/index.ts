import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';
import { checkoutReturnUrls } from '../_shared/checkout-redirects.ts';

type ServicePaymentResult={payment_id:string;booking_id:string;amount:number;currency:string;provider_checkout_session_id:string|null;reused:boolean};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY');
 if(!url||!anon||!service||!stripeKey)return json({error:'Service checkout is not configured'},503);
 const appOrigin=Deno.env.get('CHECKOUT_APP_ORIGIN');
 try{checkoutReturnUrls(appOrigin,'booking','configuration-check');}catch{return json({error:'Checkout return destination is not configured'},503);}
 const auth=req.headers.get('Authorization'),idem=req.headers.get('Idempotency-Key');
 if(!auth||!idem||idem.length<16||idem.length>128)return json({error:'Authentication and a valid Idempotency-Key are required'},401);
 const body=await req.json().catch(()=>null) as {booking_id?:unknown}|null;
 const bookingId=typeof body?.booking_id==='string'?body.booking_id.trim():'';
 if(!bookingId)return json({error:'Booking reference is required'},400);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}),admin=createClient(url,service);
 const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:'Invalid session'},401);
 let paymentId:string|undefined;
 try{
  const {data:raw,error}=await userClient.rpc('create_service_payment',{p_booking_id:bookingId,p_idempotency_key:idem});
  if(error)throw error;
  const payment=raw as ServicePaymentResult;
  paymentId=payment.payment_id;
  if(!paymentId||payment.booking_id!==bookingId||!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0)throw new Error('Invalid service payment response');
  const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
  if(payment.provider_checkout_session_id){
   const existing=await stripe.checkout.sessions.retrieve(payment.provider_checkout_session_id);
   return json({paymentId,bookingId,total:payment.amount,checkoutUrl:existing.url,reused:true});
  }
  // The database serializes the payment attempt per booking. A stable provider idempotency
  // key also makes concurrent callers converge on one Stripe Checkout Session.
  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   line_items:[{price_data:{currency:payment.currency,product_data:{name:'Everest Local service booking deposit'},unit_amount:Math.round(Number(payment.amount)*100)},quantity:1}],
   metadata:{payment_kind:'service',service_payment_id:paymentId,booking_id:bookingId,customer_id:user.id},
   payment_intent_data:{metadata:{payment_kind:'service',service_payment_id:paymentId,booking_id:bookingId,customer_id:user.id}},
   ...checkoutReturnUrls(appOrigin,'booking',bookingId),
  },{idempotencyKey:paymentId});
  const {error:updateError}=await admin.from('service_payments').update({provider_payment_id:typeof session.payment_intent==='string'?session.payment_intent:null,provider_checkout_session_id:session.id,updated_at:new Date().toISOString()}).eq('id',paymentId).eq('status','PENDING');
  if(updateError)throw updateError;
  return json({paymentId,bookingId,total:payment.amount,checkoutUrl:session.url,reused:payment.reused});
 }catch(error){
  console.error('service_checkout_failed',{message:error instanceof Error?error.message:'unknown',bookingId,paymentId:paymentId??null});
  return json({error:'Service checkout could not be created. No payment was confirmed.'},500);
 }
});
