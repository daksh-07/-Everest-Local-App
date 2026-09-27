import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type StripeMetadata={
 order_id?:string;payment_kind?:string;service_payment_id?:string;booking_id?:string;business_id?:string;
 membership_id?:string;customer_id?:string;customer_package_id?:string;package_id?:string;promotion_id?:string;
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
function connectSnapshot(account:Stripe.Account){
 const controller=account.controller as {fees?:{payer?:string}}|undefined;
 const due=[...new Set([...(account.requirements?.past_due??[]),...(account.requirements?.currently_due??[])])];
 const status=account.details_submitted&&account.charges_enabled&&account.payouts_enabled
  ?'ACTIVE'
  :((account.requirements?.past_due?.length??0)>0||Boolean(account.requirements?.disabled_reason)?'RESTRICTED':'PENDING');
 return {
  stripe_connect_status:status,
  stripe_details_submitted:Boolean(account.details_submitted),
  stripe_charges_enabled:Boolean(account.charges_enabled),
  stripe_payouts_enabled:Boolean(account.payouts_enabled),
  stripe_bank_connected:Boolean(account.external_accounts?.data?.length),
  stripe_requirements_due:due,
  stripe_connect_fee_payer:controller?.fees?.payer==='application'?'PLATFORM':'ACCOUNT',
  stripe_connect_synced_at:new Date().toISOString(),
 };
}

Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const secret=Deno.env.get('STRIPE_SECRET_KEY'),webhookSecret=Deno.env.get('STRIPE_WEBHOOK_SECRET'),connectWebhookSecret=Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET'),url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!secret||!webhookSecret||!url||!service)return json({error:'Webhook not configured'},503);
 const signature=req.headers.get('stripe-signature');if(!signature)return json({error:'Missing signature'},400);
 const body=await req.text();const stripe=new Stripe(secret,{apiVersion:'2025-07-30.basil'});
 let event:Stripe.Event|null=null;
 for(const candidate of [webhookSecret,connectWebhookSecret].filter((v):v is string=>Boolean(v))){
  try{event=stripe.webhooks.constructEvent(body,signature,candidate);break;}catch{/* try the other registered endpoint secret */}
 }
 if(!event)return json({error:'Invalid signature'},400)
 const db=createClient(url,service);
 const {data:claimed,error:claimError}=await db.rpc('claim_stripe_event',{p_event_id:event.id,p_event_type:event.type});
 if(claimError)return json({error:'Webhook event could not be claimed'},500);
 if(!claimed)return new Response('ok');

 try{
  const object=event.data.object as Stripe.Checkout.Session|Stripe.PaymentIntent|Stripe.Subscription|Stripe.Account;
  const metadata=(object.metadata??{}) as StripeMetadata;
  const connectedAccountId=(event as Stripe.Event&{account?:string}).account??null;
  let handledKind='';

  if(event.type==='account.updated'){
   const account=event.data.object as Stripe.Account;
   const snapshot=connectSnapshot(account);
   const businessId=String(account.metadata?.everest_business_id??'');
   let update= db.from('businesses').update(snapshot);
   update=businessId?update.eq('id',businessId):update.eq('stripe_connected_account_id',account.id);
   const {data:rows,error}=await update.select('id');
   if(error)throw error;
   const ids=(rows??[]).map(row=>String(row.id));
   if(snapshot.stripe_connect_status!=='ACTIVE'&&ids.length){
    await Promise.all([
     db.from('services').update({active:false,updated_at:new Date().toISOString()}).in('business_id',ids).eq('active',true),
     db.from('products').update({status:'PAUSED',updated_at:new Date().toISOString()}).in('business_id',ids).eq('status','ACTIVE'),
    ]);
   }
   handledKind='stripe_connect_account';
  }

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
  }else if(metadata.payment_kind==='post_promotion'){
   const promotionId=String(metadata.promotion_id??'');
   if(!promotionId)throw new Error('Missing post promotion metadata');
   const success=event.type==='payment_intent.succeeded'||event.type==='checkout.session.completed';
   const failure=event.type==='payment_intent.payment_failed'||event.type==='payment_intent.canceled'||event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed';
   if(success){
    if(event.type==='checkout.session.completed'&&(event.data.object as Stripe.Checkout.Session).payment_status!=='paid'){
     // Deferred methods activate after payment_intent.succeeded.
    }else{
     const paymentObject=event.data.object as Stripe.Checkout.Session|Stripe.PaymentIntent;
     const checkoutSessionId=event.type==='checkout.session.completed'?(paymentObject as Stripe.Checkout.Session).id:null;
     const paymentIntentId=event.type==='payment_intent.succeeded'
      ?(paymentObject as Stripe.PaymentIntent).id
      :typeof (paymentObject as Stripe.Checkout.Session).payment_intent==='string'
       ?(paymentObject as Stripe.Checkout.Session).payment_intent as string
       :(paymentObject as Stripe.Checkout.Session).payment_intent?.id??null;
     const {error}=await db.rpc('activate_post_promotion',{
      p_promotion_id:promotionId,p_checkout_session_id:checkoutSessionId,p_payment_intent_id:paymentIntentId
     });
     if(error)throw error;
    }
   }else if(failure){
    const {error}=await db.rpc('fail_post_promotion',{p_promotion_id:promotionId});
    if(error)throw error;
   }
   handledKind='post_promotion';
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
       if(connectedAccountId){
        const {error:ledgerError}=await db.from('marketplace_payout_ledger').update({
         status:'DIRECT_SETTLED',charge_model:'DIRECT',fee_payer:'CONNECTED_ACCOUNT',
         stripe_connected_account_id:connectedAccountId,updated_at:new Date().toISOString(),
        }).eq('source_type','SERVICE_PAYMENT').eq('source_id',servicePaymentId);
        if(ledgerError)throw ledgerError;
       }
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
     if(connectedAccountId){
      const {error:ledgerError}=await db.from('marketplace_payout_ledger').update({
       status:'DIRECT_SETTLED',charge_model:'DIRECT',fee_payer:'CONNECTED_ACCOUNT',
       stripe_connected_account_id:connectedAccountId,updated_at:new Date().toISOString(),
      }).eq('source_type','PRODUCT_ORDER').eq('source_id',orderId);
      if(ledgerError)throw ledgerError;
     }
    }
   }else if(failureEvents){
    if(!orderId){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});return json({error:'Missing order metadata'},400);}
    const {error}=await db.rpc('process_stripe_order_failure',{p_order_id:orderId});
    if(error)throw error;
   }
  }

  const {error:auditError}=await db.from('audit_logs').insert({
   action:'stripe:'+event.id,entity_type:'stripe_event',entity_id:null,
   metadata:{type:event.type,payment_kind:handledKind||metadata.payment_kind||null,connected_account_id:connectedAccountId,business_id:metadata.business_id??null,membership_id:metadata.membership_id??null,customer_package_id:metadata.customer_package_id??null,promotion_id:metadata.promotion_id??null,order_id:metadata.order_id??null,service_payment_id:metadata.service_payment_id??null,booking_id:metadata.booking_id??null}
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