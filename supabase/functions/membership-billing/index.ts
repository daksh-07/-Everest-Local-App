import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const appUrl=()=>String(Deno.env.get('APP_PUBLIC_URL')??'https://everest-local-app.vercel.app').replace(/\/$/,'');
const keyFor=(req:Request,fallback:string)=>{
 const supplied=req.headers.get('Idempotency-Key')?.trim();
 if(supplied&&supplied.length>=16&&supplied.length<=128)return supplied;
 return fallback;
};

type MembershipCheckout={
 membership_id:string;business_id:string;customer_id:string;title:string;price:number;currency:string;
 interval_unit:'DAY'|'WEEK'|'MONTH'|'YEAR';interval_count:number;start_date:string;checkout_session_id:string|null;
 connected_account_id:string;marketplace_fee_per_period:number;application_fee_percent:number;fee_policy_version:string;
};
type PackageCheckout={
 customer_package_id:string;package_id:string;business_id:string;customer_id:string;name?:string;price:number;currency:string;credits:number;checkout_session_id:string|null;
 connected_account_id:string;marketplace_fee:number;provider_net:number;fee_policy_version:string;
};

function recurring(unit:string,count:number):{interval:'day'|'week'|'month'|'year';interval_count:number}{
 const interval=unit.toLowerCase() as 'day'|'week'|'month'|'year';
 const maximum=interval==='day'?365:interval==='week'?52:interval==='month'?12:3;
 if(!['day','week','month','year'].includes(interval)||!Number.isInteger(count)||count<1||count>maximum)throw new Error('Unsupported recurring interval');
 return {interval,interval_count:count};
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 const url=Deno.env.get('SUPABASE_URL')??'';
 const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
 const stripeKey=Deno.env.get('STRIPE_SECRET_KEY')??'';
 if(!url||!publishable||!service||!stripeKey)return json({error:'Membership billing is not configured.'},503);

 const auth=req.headers.get('Authorization')??'';
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const admin=createClient(url,service,{auth:{persistSession:false}});
 const {data:{user}}=await userClient.auth.getUser();
 if(!user)return json({error:'Authentication required.'},401);

 const body=await req.json().catch(()=>({})) as Record<string,unknown>;
 const action=String(body.action??'');
 const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
 const base=appUrl();

 try{
  if(action==='START_MEMBERSHIP'){
   const membershipId=String(body.membershipId??'');
   if(!membershipId)return json({error:'Membership is required.'},400);
   const idem=keyFor(req,'membership:'+membershipId+':'+user.id);
   const {data,error}=await userClient.rpc('prepare_membership_checkout',{p_membership_id:membershipId,p_idempotency_key:idem});
   if(error)throw error;
   const m=data as MembershipCheckout;
   if(m.customer_id!==user.id)throw new Error('Membership customer mismatch');
   const connectedId=String(m.connected_account_id??'');
   const feePercent=Number(m.application_fee_percent??0);
   if(!/^acct_[A-Za-z0-9]+$/.test(connectedId))return json({error:'This business is still setting up payouts.'},409);
   if(!Number.isFinite(feePercent)||feePercent<0||feePercent>100)throw new Error('Invalid membership application fee');
   if(m.checkout_session_id){
    try{
     const existing=await stripe.checkout.sessions.retrieve(m.checkout_session_id,{}, {stripeAccount:connectedId});
     if(existing.url&&existing.status==='open')return json({url:existing.url,membershipId,reused:true});
    }catch{/* stale or inaccessible session: create a fresh attempt below */}
    const {error:clearError}=await admin.from('customer_memberships')
     .update({stripe_checkout_session_id:null,updated_at:new Date().toISOString()})
     .eq('id',m.membership_id).eq('customer_id',user.id).eq('stripe_connected_account_id',connectedId)
     .eq('stripe_checkout_session_id',m.checkout_session_id);
    if(clearError)throw clearError;
   }
   const start=Date.parse(m.start_date+'T00:00:00Z');
   const trialEnd=Number.isFinite(start)&&start>Date.now()+60_000?Math.floor(start/1000):undefined;
   const session=await stripe.checkout.sessions.create({
    mode:'subscription',
    customer_email:user.email??undefined,
    line_items:[{
     price_data:{
      currency:m.currency,
      product_data:{name:m.title,metadata:{everest_business_id:m.business_id,membership_id:m.membership_id}},
      unit_amount:Math.round(Number(m.price)*100),
      recurring:recurring(m.interval_unit,Number(m.interval_count)),
     },
     quantity:1,
    }],
    success_url:base+'/memberships?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancel_url:base+'/memberships?checkout=cancelled',
    metadata:{payment_kind:'business_membership',membership_id:m.membership_id,business_id:m.business_id,customer_id:user.id},
    subscription_data:{
     application_fee_percent:feePercent,
     metadata:{
      payment_kind:'business_membership',membership_id:m.membership_id,business_id:m.business_id,
      customer_id:user.id,connected_account_id:connectedId,fee_policy_version:m.fee_policy_version
     },
     ...(trialEnd?{trial_end:trialEnd}:{})
    },
   },{idempotencyKey:'membership-checkout:'+m.membership_id+':'+idem,stripeAccount:connectedId});
   if(!session.url)throw new Error('Stripe Checkout URL was not returned');
   const {error:attachError}=await admin.rpc('attach_membership_checkout_session',{p_membership_id:m.membership_id,p_session_id:session.id});
   if(attachError)throw attachError;
   return json({url:session.url,membershipId:m.membership_id,reused:false});
  }

  if(action==='BUY_PACKAGE'){
   const packageId=String(body.packageId??'');
   if(!packageId)return json({error:'Package is required.'},400);
   const idem=keyFor(req,'package:'+packageId+':'+user.id+':'+crypto.randomUUID());
   const {data,error}=await userClient.rpc('prepare_package_checkout',{p_package_id:packageId,p_idempotency_key:idem});
   if(error)throw error;
   const p=data as PackageCheckout;
   if(p.customer_id!==user.id)throw new Error('Package customer mismatch');
   const connectedId=String(p.connected_account_id??'');
   if(!/^acct_[A-Za-z0-9]+$/.test(connectedId))return json({error:'This business is still setting up payouts.'},409);
   if(p.checkout_session_id){
    try{
     const existing=await stripe.checkout.sessions.retrieve(p.checkout_session_id,{}, {stripeAccount:connectedId});
     if(existing.url&&existing.status==='open')return json({url:existing.url,customerPackageId:p.customer_package_id,reused:true});
    }catch{/* stale or inaccessible session: create a fresh attempt below */}
    const {error:clearError}=await admin.from('customer_packages')
     .update({stripe_checkout_session_id:null,updated_at:new Date().toISOString()})
     .eq('id',p.customer_package_id).eq('customer_id',user.id).eq('stripe_connected_account_id',connectedId)
     .eq('stripe_checkout_session_id',p.checkout_session_id);
    if(clearError)throw clearError;
   }
   const applicationFeeCents=Math.round(Number(p.marketplace_fee??0)*100);
   const session=await stripe.checkout.sessions.create({
    mode:'payment',
    customer_email:user.email??undefined,
    line_items:[{price_data:{currency:p.currency,product_data:{name:p.name??'Everest Local prepaid package',description:p.credits+' service credits'},unit_amount:Math.round(Number(p.price)*100)},quantity:1}],
    success_url:base+'/memberships?package=success&session_id={CHECKOUT_SESSION_ID}',
    cancel_url:base+'/memberships?package=cancelled',
    metadata:{
     payment_kind:'business_package',customer_package_id:p.customer_package_id,package_id:p.package_id,
     business_id:p.business_id,customer_id:user.id,connected_account_id:connectedId,fee_policy_version:p.fee_policy_version
    },
    payment_intent_data:{
     metadata:{
      payment_kind:'business_package',customer_package_id:p.customer_package_id,package_id:p.package_id,
      business_id:p.business_id,customer_id:user.id,connected_account_id:connectedId,fee_policy_version:p.fee_policy_version
     },
     ...(applicationFeeCents>0?{application_fee_amount:applicationFeeCents}:{})
    },
   },{idempotencyKey:'package-checkout:'+p.customer_package_id+':'+idem,stripeAccount:connectedId});
   if(!session.url)throw new Error('Stripe Checkout URL was not returned');
   const {error:attachError}=await admin.rpc('attach_package_checkout_session',{p_customer_package_id:p.customer_package_id,p_session_id:session.id});
   if(attachError)throw attachError;
   return json({url:session.url,customerPackageId:p.customer_package_id,reused:false});
  }

  if(action==='PORTAL'||action==='CANCEL_AT_PERIOD_END'||action==='RESUME'){
   const membershipId=String(body.membershipId??'');
   if(!membershipId)return json({error:'Membership is required.'},400);
   const {data:m,error}=await userClient.from('customer_memberships')
    .select('id,stripe_customer_id,stripe_subscription_id,stripe_connected_account_id,status')
    .eq('id',membershipId).eq('customer_id',user.id).maybeSingle();
   if(error)throw error;
   if(!m)return json({error:'Membership not found.'},404);
   const connectedId=String(m.stripe_connected_account_id??'');
   if(!/^acct_[A-Za-z0-9]+$/.test(connectedId))return json({error:'Membership payout account is unavailable.'},409);
   if(action==='PORTAL'){
    if(!m.stripe_customer_id)return json({error:'No billing account exists for this membership yet.'},400);
    const portal=await stripe.billingPortal.sessions.create(
     {customer:m.stripe_customer_id,return_url:base+'/memberships'},
     {stripeAccount:connectedId}
    );
    return json({url:portal.url});
   }
   if(!m.stripe_subscription_id)return json({error:'No active Stripe subscription exists.'},400);
   const subscription=await stripe.subscriptions.update(
    m.stripe_subscription_id,
    {cancel_at_period_end:action==='CANCEL_AT_PERIOD_END'},
    {stripeAccount:connectedId}
   );
   return json({ok:true,status:subscription.status,cancelAtPeriodEnd:subscription.cancel_at_period_end});
  }

  return json({error:'Unsupported action.'},400);
 }catch(error){
  console.error('membership_billing_failed',{action,userId:user.id,message:error instanceof Error?error.message:'unknown'});
  return json({error:error instanceof Error?error.message:'Membership billing request failed.'},400);
 }
});