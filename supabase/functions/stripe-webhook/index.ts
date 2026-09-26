import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type StripeMetadata={
 order_id?:string;payment_kind?:string;service_payment_id?:string;booking_id?:string;business_id?:string;
 membership_id?:string;customer_id?:string;customer_package_id?:string;package_id?:string;
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

function mapProStatus(status:Stripe.Subscription.Status){
 const mapped=String(status).toUpperCase().replaceAll('-','_');
 return mapped==='CANCELED'?'CANCELED':mapped;
}
function mapCustomerMembershipStatus(status:Stripe.Subscription.Status){
 const value=String(status).toLowerCase();
 if(value==='active')return 'ACTIVE';
 if(value==='trialing')return 'TRIALING';
 if(value==='past_due'||value==='unpaid')return 'PAST_DUE';
 if(value==='paused')return 'PAUSED';
 if(value==='incomplete')return 'INCOMPLETE';
 if(value==='canceled'||value==='incomplete_expired')return 'CANCELED';
 return 'INCOMPLETE';
}
const subscriptionCustomer=(subscription:Stripe.Subscription)=>typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id??null;
const subscriptionPeriod=(subscription:Stripe.Subscription)=>{
 const raw=subscription as Stripe.Subscription&{current_period_start?:number;current_period_end?:number};
 return {
  start:raw.current_period_start?new Date(raw.current_period_start*1000).toISOString():null,
  end:raw.current_period_end?new Date(raw.current_period_end*1000).toISOString():null,
 };
};

async function persistProSubscription(db:unknown,subscription:Stripe.Subscription,eventId:string,eventCreated:number,fallbackBusinessId?:string){
 const businessId=String(subscription.metadata?.business_id??fallbackBusinessId??'');
 if(!businessId)throw new Error('Everest Pro subscription is missing business metadata');
 const customerId=subscriptionCustomer(subscription);
 const priceId=subscription.items?.data?.[0]?.price?.id??null;
 const period=subscriptionPeriod(subscription);
 const rpc=(db as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{error:{message?:string}|null}>}).rpc.bind(db);
 const {error}=await rpc('set_business_subscription_from_stripe',{
  p_business_id:businessId,p_customer_id:customerId,p_subscription_id:subscription.id,p_price_id:priceId,
  p_status:mapProStatus(subscription.status),p_current_period_end:period.end,p_cancel_at_period_end:Boolean(subscription.cancel_at_period_end),
  p_event_id:eventId,p_event_created_at:new Date(eventCreated*1000).toISOString(),
 });
 if(error)throw error;
 return businessId;
}

async function persistCustomerMembership(db:unknown,subscription:Stripe.Subscription,eventId:string,eventCreated:number,fallbackMembershipId?:string){
 const membershipId=String(subscription.metadata?.membership_id??fallbackMembershipId??'');
 if(!membershipId)throw new Error('Customer membership subscription is missing membership metadata');
 const period=subscriptionPeriod(subscription);
 const rpc=(db as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{error:{message?:string}|null}>}).rpc.bind(db);
 const {error}=await rpc('set_customer_membership_from_stripe',{
  p_membership_id:membershipId,
  p_customer_id:subscriptionCustomer(subscription),
  p_subscription_id:subscription.id,
  p_status:mapCustomerMembershipStatus(subscription.status),
  p_period_start:period.start,
  p_period_end:period.end,
  p_cancel_at_period_end:Boolean(subscription.cancel_at_period_end),
  p_event_id:eventId,
  p_event_created_at:new Date(eventCreated*1000).toISOString(),
 });
 if(error)throw error;
 return membershipId;
}

function invoiceSubscriptionId(invoice:unknown){
 const i=invoice as {subscription?:string|{id?:string}|null;parent?:{subscription_details?:{subscription?:string|{id?:string}|null}}|null};
 const direct=i.subscription;
 if(typeof direct==='string')return direct;
 if(direct&&typeof direct==='object'&&direct.id)return direct.id;
 const nested=i.parent?.subscription_details?.subscription;
 if(typeof nested==='string')return nested;
 if(nested&&typeof nested==='object'&&nested.id)return nested.id;
 return '';
}
function invoicePaymentIntentId(invoice:unknown){
 const i=invoice as {payment_intent?:string|{id?:string}|null};
 return typeof i.payment_intent==='string'?i.payment_intent:i.payment_intent?.id??null;
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
  let handledKind=metadata.payment_kind??'';

  // Invoice objects do not reliably copy subscription metadata. Resolve the
  // subscription first and route by its server-owned metadata.
  if(event.type.startsWith('invoice.')){
   const invoice=event.data.object as unknown;
   const subscriptionId=invoiceSubscriptionId(invoice);
   if(subscriptionId){
    const subscription=await stripe.subscriptions.retrieve(subscriptionId);
    const subKind=String(subscription.metadata?.payment_kind??'');
    if(subKind==='business_membership'){
     const membershipId=await persistCustomerMembership(db,subscription,event.id,event.created);
     const inv=invoice as {id:string;amount_paid?:number;amount_due?:number;currency?:string;period_start?:number;period_end?:number};
     const invoiceStatus=event.type==='invoice.paid'||event.type==='invoice.payment_succeeded'?'PAID':event.type==='invoice.payment_failed'?'FAILED':event.type==='invoice.voided'?'VOID':null;
     if(invoiceStatus){
      const {error}=await db.rpc('record_membership_invoice',{
       p_membership_id:membershipId,
       p_invoice_id:inv.id,
       p_payment_intent_id:invoicePaymentIntentId(invoice),
       p_amount:Number((invoiceStatus==='PAID'?inv.amount_paid:inv.amount_due)??0)/100,
       p_currency:String(inv.currency??'aud').toLowerCase(),
       p_status:invoiceStatus,
       p_period_start:inv.period_start?new Date(inv.period_start*1000).toISOString():null,
       p_period_end:inv.period_end?new Date(inv.period_end*1000).toISOString():null,
       p_event_id:event.id,
      });
      if(error)throw error;
     }
     handledKind='business_membership';
    }else if(subKind==='everest_pro'){
     await persistProSubscription(db,subscription,event.id,event.created);
     handledKind='everest_pro';
    }
   }
  }

  if(handledKind==='business_membership'&&event.type.startsWith('invoice.')){
   // already handled above
  }else if(metadata.payment_kind==='business_membership'){
   let subscription:Stripe.Subscription|null=null;
   let membershipId=metadata.membership_id;
   if(event.type==='checkout.session.completed'){
    const session=event.data.object as Stripe.Checkout.Session;
    if(session.mode!=='subscription')throw new Error('Membership checkout was not a subscription');
    const subscriptionId=typeof session.subscription==='string'?session.subscription:session.subscription?.id;
    if(!subscriptionId)throw new Error('Membership checkout completed without subscription id');
    subscription=await stripe.subscriptions.retrieve(subscriptionId);
    membershipId=String(session.metadata?.membership_id??membershipId??'');
   }else if(event.type.startsWith('customer.subscription.')){
    subscription=event.data.object as Stripe.Subscription;
   }
   if(subscription)await persistCustomerMembership(db,subscription,event.id,event.created,membershipId);
   handledKind='business_membership';
  }else if(metadata.payment_kind==='everest_pro'){
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
   }
   if(subscription)await persistProSubscription(db,subscription,event.id,event.created,businessId);
   handledKind='everest_pro';
  }else if(metadata.payment_kind==='business_package'){
   const customerPackageId=String(metadata.customer_package_id??'');
   if(!customerPackageId)throw new Error('Missing package purchase metadata');
   const success=event.type==='payment_intent.succeeded'||(event.type==='checkout.session.completed'&&(event.data.object as Stripe.Checkout.Session).payment_status==='paid');
   if(success){
    let checkoutSessionId='';
    let paymentIntentId:string|null=null;
    if(event.type==='checkout.session.completed'){
     const session=event.data.object as Stripe.Checkout.Session;
     checkoutSessionId=session.id;
     paymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id??null;
    }else{
     const intent=event.data.object as Stripe.PaymentIntent;
     paymentIntentId=intent.id;
     const {data:row,error}=await db.from('customer_packages').select('stripe_checkout_session_id').eq('id',customerPackageId).maybeSingle();
     if(error)throw error;
     checkoutSessionId=String(row?.stripe_checkout_session_id??'');
    }
    if(!checkoutSessionId)throw new Error('Package checkout session unavailable');
    const {error}=await db.rpc('process_package_checkout_success',{p_customer_package_id:customerPackageId,p_checkout_session_id:checkoutSessionId,p_payment_intent_id:paymentIntentId,p_event_id:event.id});
    if(error)throw error;
   }
   handledKind='business_package';
  }

  if(!handledKind){
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
  }

  const {error:auditError}=await db.from('audit_logs').insert({
   action:'stripe:'+event.id,entity_type:'stripe_event',entity_id:null,
   metadata:{type:event.type,payment_kind:handledKind||metadata.payment_kind||null,business_id:metadata.business_id??null,membership_id:metadata.membership_id??null,customer_package_id:metadata.customer_package_id??null,order_id:metadata.order_id??null,service_payment_id:metadata.service_payment_id??null,booking_id:metadata.booking_id??null}
  });
  if(auditError)throw auditError;
  const {error:finishError}=await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:true});
  if(finishError)throw finishError;
  return new Response('ok');
 }catch(error){
  await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});
  console.error('stripe_webhook_failed',{message:error instanceof Error?error.message:'unknown'});
  return json({error:'Webhook processing failed'},500);
 }
});