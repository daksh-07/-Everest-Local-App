import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type StripeMetadata={order_id?:string;payment_kind?:string;service_payment_id?:string;booking_id?:string;business_id?:string};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

function mapSubscriptionStatus(status:Stripe.Subscription.Status){
 const mapped=String(status).toUpperCase().replaceAll('-','_');
 return mapped==='CANCELED'?'CANCELED':mapped;
}

async function persistProSubscription(db:unknown,subscription:Stripe.Subscription,eventId:string,eventCreated:number,fallbackBusinessId?:string){
 const businessId=String(subscription.metadata?.business_id??fallbackBusinessId??'');
 if(!businessId)throw new Error('Everest Pro subscription is missing business metadata');
 const customerId=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id??null;
 const priceId=subscription.items?.data?.[0]?.price?.id??null;
 const periodEnd=subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null;
 const rpc=(db as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{error:{message?:string}|null}>}).rpc.bind(db);
 const {error}=await rpc('set_business_subscription_from_stripe',{
  p_business_id:businessId,
  p_customer_id:customerId,
  p_subscription_id:subscription.id,
  p_price_id:priceId,
  p_status:mapSubscriptionStatus(subscription.status),
  p_current_period_end:periodEnd,
  p_cancel_at_period_end:Boolean(subscription.cancel_at_period_end),
  p_event_id:eventId,
  p_event_created_at:new Date(eventCreated*1000).toISOString(),
 });
 if(error)throw error;
 return businessId;
}

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
  const object=event.data.object as Stripe.Checkout.Session|Stripe.PaymentIntent|Stripe.Subscription;
  const metadata=(object.metadata??{}) as StripeMetadata;
  const isPro=metadata.payment_kind==='everest_pro'||event.type.startsWith('customer.subscription.');

  if(isPro){
   let subscription:Stripe.Subscription|null=null;
   let businessId=metadata.business_id;
   if(event.type==='checkout.session.completed'){
    const session=event.data.object as Stripe.Checkout.Session;
    if(session.mode!=='subscription')throw new Error('Everest Pro checkout was not a subscription');
    const subscriptionId=typeof session.subscription==='string'?session.subscription:session.subscription?.id;
    if(!subscriptionId)throw new Error('Subscription checkout completed without subscription id');
    subscription=await stripe.subscriptions.retrieve(subscriptionId);
    businessId=String(session.metadata?.business_id??businessId??'');
   }else if(event.type.startsWith('customer.subscription.')){
    subscription=event.data.object as Stripe.Subscription;
    businessId=String(subscription.metadata?.business_id??businessId??'');
   }
   if(subscription)businessId=await persistProSubscription(db,subscription,event.id,event.created,businessId);
   const {error:auditError}=await db.from('audit_logs').insert({action:'stripe:'+event.id,entity_type:'stripe_event',entity_id:null,metadata:{type:event.type,payment_kind:'everest_pro',business_id:businessId??null}});
   if(auditError)throw auditError;
   const {error:finishError}=await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:true});
   if(finishError)throw finishError;
   return new Response('ok');
  }

  const paymentObject=event.data.object as Stripe.Checkout.Session|Stripe.PaymentIntent;
  const paymentMetadata=(paymentObject.metadata??{}) as StripeMetadata;
  const isService=paymentMetadata.payment_kind==='service';
  const orderId=paymentMetadata.order_id;
  const servicePaymentId=paymentMetadata.service_payment_id;
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

  const {error:auditError}=await db.from('audit_logs').insert({action:'stripe:'+event.id,entity_type:'stripe_event',entity_id:null,metadata:{type:event.type,order_id:orderId??null,service_payment_id:servicePaymentId??null,booking_id:paymentMetadata.booking_id??null}});
  if(auditError)throw auditError;
  const {error:finishError}=await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:true});
  if(finishError)throw finishError;
  return new Response('ok');
 }catch(error){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});console.error('stripe_webhook_failed',{message:error instanceof Error?error.message:'unknown'});return json({error:'Webhook processing failed'},500)}
});
