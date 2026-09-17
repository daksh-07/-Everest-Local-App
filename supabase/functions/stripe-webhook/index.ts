import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type StripeMetadata={order_id?:string;payment_kind?:string;service_payment_id?:string;booking_id?:string};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const secret=Deno.env.get('STRIPE_SECRET_KEY'),webhookSecret=Deno.env.get('STRIPE_WEBHOOK_SECRET'),url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!secret||!webhookSecret||!url||!service)return json({error:'Webhook not configured'},503);
 const signature=req.headers.get('stripe-signature');if(!signature)return json({error:'Missing signature'},400);
 const body=await req.text();const stripe=new Stripe(secret,{apiVersion:'2025-07-30.basil'});
 let event:Stripe.Event;try{event=stripe.webhooks.constructEvent(body,signature,webhookSecret);}catch{return json({error:'Invalid signature'},400)}
 const db=createClient(url,service);
 const {data:claimed,error:claimError}=await db.rpc('claim_stripe_event',{p_event_id:event.id,p_event_type:event.type});
 if(claimError)return json({error:'Webhook event could not be claimed'},500);
 if(!claimed)return new Response('ok');
 try{
  const object=event.data.object as Stripe.Checkout.Session|Stripe.PaymentIntent;
  const metadata=(object.metadata??{}) as StripeMetadata;
  const isService=metadata.payment_kind==='service';
  const orderId=metadata.order_id;
  const servicePaymentId=metadata.service_payment_id;
  const successEvents=event.type==='payment_intent.succeeded'||event.type==='checkout.session.completed';
  const failureEvents=event.type==='payment_intent.payment_failed'||event.type==='payment_intent.canceled'||event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed';

  if(isService){
   if(!servicePaymentId){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});return json({error:'Missing service payment metadata'},400);}
   if(successEvents){
    if(event.type==='checkout.session.completed' && (event.data.object as Stripe.Checkout.Session).payment_status!=='paid'){
      // Deferred payment methods settle through payment_intent.succeeded.
    }else{
      const {error}=await db.rpc('process_stripe_service_success',{p_payment_id:servicePaymentId});
      if(error)throw error;
    }
   }else if(failureEvents){
    const {error}=await db.rpc('process_stripe_service_failure',{p_payment_id:servicePaymentId});
    if(error)throw error;
   }
  }else if(successEvents){
   if(event.type==='checkout.session.completed' && (event.data.object as Stripe.Checkout.Session).payment_status!=='paid'){
     // Deferred payment methods settle through payment_intent.succeeded.
   }else{
    if(!orderId){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});return json({error:'Missing order metadata'},400);}
    const {error}=await db.rpc('process_stripe_order_success',{p_order_id:orderId});
    if(error)throw error;
   }
  }else if(failureEvents){
   if(!orderId){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});return json({error:'Missing order metadata'},400);}
   const {error}=await db.rpc('process_stripe_order_failure',{p_order_id:orderId});
   if(error)throw error;
  }

  const {error:auditError}=await db.from('audit_logs').insert({action:'stripe:'+event.id,entity_type:'stripe_event',entity_id:null,metadata:{type:event.type,order_id:orderId??null,service_payment_id:servicePaymentId??null,booking_id:metadata.booking_id??null}});
  if(auditError)throw auditError;
  const {error:finishError}=await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:true});
  if(finishError)throw finishError;
  return new Response('ok');
 }catch(error){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});console.error('stripe_webhook_failed',{message:error instanceof Error?error.message:'unknown'});return json({error:'Webhook processing failed'},500)}
});
