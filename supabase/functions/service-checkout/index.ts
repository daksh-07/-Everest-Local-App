import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type ServicePaymentResult={payment_id:string;booking_id:string;amount:number;currency:string;payment_kind?:'DEPOSIT'|'BALANCE';provider_checkout_session_id:string|null;reused:boolean};
type ServiceFeeSnapshot={marketplace_fee:number;provider_net:number;fee_policy_version:string;stripe_connected_account_id:string|null};
type ConnectBusiness={
 stripe_connected_account_id:string|null;stripe_connect_status:string;
 stripe_details_submitted:boolean;stripe_charges_enabled:boolean;stripe_payouts_enabled:boolean;
};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const connectReady=(b:ConnectBusiness|null)=>Boolean(
 b?.stripe_connected_account_id&&b.stripe_connect_status==='ACTIVE'&&
 b.stripe_details_submitted&&b.stripe_charges_enabled&&b.stripe_payouts_enabled
);

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY');
 if(!url||!anon||!service||!stripeKey)return json({error:'Service checkout is not configured'},503);
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

  const [
   {data:feeRow,error:feeError},
   {data:booking,error:bookingError},
  ]=await Promise.all([
   admin.from('service_payments').select('marketplace_fee,provider_net,fee_policy_version,stripe_connected_account_id').eq('id',paymentId).single(),
   admin.from('bookings').select('business_id').eq('id',bookingId).single(),
  ]);
  if(feeError)throw feeError;
  if(bookingError)throw bookingError;
  const fee=feeRow as ServiceFeeSnapshot;
  const businessId=String(booking.business_id??'');
  if(!businessId)throw new Error('Booking business is unavailable');

  const {data:business,error:businessError}=await admin.from('businesses')
   .select('stripe_connected_account_id,stripe_connect_status,stripe_details_submitted,stripe_charges_enabled,stripe_payouts_enabled')
   .eq('id',businessId).maybeSingle();
  if(businessError)throw businessError;
  const connected=business as ConnectBusiness|null;
  if(!connectReady(connected))return json({error:'This business is still setting up payouts. No payment was taken.'},409);
  const connectedId=connected!.stripe_connected_account_id!;

  const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
  if(payment.provider_checkout_session_id){
   let existing:Stripe.Checkout.Session;
   const storedAccount=fee.stripe_connected_account_id||connectedId;
   try{
    existing=await stripe.checkout.sessions.retrieve(payment.provider_checkout_session_id,{}, {stripeAccount:storedAccount});
   }catch{
    // Backward compatibility for a checkout created before Stripe Connect routing.
    existing=await stripe.checkout.sessions.retrieve(payment.provider_checkout_session_id);
   }
   return json({paymentId,bookingId,total:payment.amount,checkoutUrl:existing.url,reused:true});
  }

  const applicationFeeCents=Math.max(0,Math.round(Number(fee.marketplace_fee)*100));
  const metadata={
   payment_kind:'service',
   service_payment_stage:payment.payment_kind??'DEPOSIT',
   service_payment_id:paymentId,
   booking_id:bookingId,
   business_id:businessId,
   customer_id:user.id,
   stripe_charge_model:'DIRECT',
   stripe_fee_payer:'CONNECTED_ACCOUNT',
   everest_fee:String(fee.marketplace_fee),
   provider_net_before_stripe_fees:String(fee.provider_net),
   fee_policy_version:fee.fee_policy_version,
  };
  const paymentIntentData:Stripe.Checkout.SessionCreateParams.PaymentIntentData={
   metadata,
   ...(applicationFeeCents>0?{application_fee_amount:applicationFeeCents}:{}),
  };

  // A stable DB payment ID and Stripe idempotency key make concurrent callers converge
  // on one connected-account Checkout Session.
  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   line_items:[{
    price_data:{
     currency:payment.currency,
     product_data:{name:payment.payment_kind==='BALANCE'?'Everest Local service booking balance':'Everest Local service booking deposit'},
     unit_amount:Math.round(Number(payment.amount)*100),
    },
    quantity:1,
   }],
   metadata,
   payment_intent_data:paymentIntentData,
   success_url:`everestlocal://booking/success?booking_id=${encodeURIComponent(bookingId)}`,
   cancel_url:`everestlocal://booking/cancelled?booking_id=${encodeURIComponent(bookingId)}`,
  },{idempotencyKey:paymentId,stripeAccount:connectedId});

  const {error:updateError}=await admin.from('service_payments').update({
   provider_payment_id:typeof session.payment_intent==='string'?session.payment_intent:null,
   provider_checkout_session_id:session.id,
   stripe_connected_account_id:connectedId,
   stripe_charge_model:'DIRECT',
   stripe_application_fee:Number(fee.marketplace_fee),
   updated_at:new Date().toISOString(),
  }).eq('id',paymentId).eq('status','PENDING');
  if(updateError)throw updateError;

  return json({
   paymentId,bookingId,total:payment.amount,
   marketplaceFee:fee.marketplace_fee,
   providerNetBeforeStripeFees:fee.provider_net,
   checkoutUrl:session.url,reused:payment.reused,
  });
 }catch(error){
  console.error('service_checkout_failed',{message:error instanceof Error?error.message:'unknown',bookingId,paymentId:paymentId??null});
  return json({error:'Service checkout could not be created. No payment was confirmed.'},500);
 }
});
