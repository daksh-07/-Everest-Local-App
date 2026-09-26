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
};
type PackageCheckout={
 customer_package_id:string;package_id:string;business_id:string;customer_id:string;name?:string;price:number;currency:string;credits:number;checkout_session_id:string|null;
};

function recurring(unit:string,count:number):Stripe.Price.Recurring{
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
   if(m.checkout_session_id){
    const existing=await stripe.checkout.sessions.retrieve(m.checkout_session_id);
    if(existing.url&&existing.status==='open')return json({url:existing.url,membershipId,reused:true});
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
     metadata:{payment_kind:'business_membership',membership_id:m.membership_id,business_id:m.business_id,customer_id:user.id},
     ...(trialEnd?{trial_end:trialEnd}:{})
    },
   },{idempotencyKey:'membership-checkout:'+m.membership_id});
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
   if(p.checkout_session_id){
    const existing=await stripe.checkout.sessions.retrieve(p.checkout_session_id);
    if(existing.url&&existing.status==='open')return json({url:existing.url,customerPackageId:p.customer_package_id,reused:true});
   }
   const session=await stripe.checkout.sessions.create({
    mode:'payment',
    customer_email:user.email??undefined,
    line_items:[{price_data:{currency:p.currency,product_data:{name:p.name??'Everest Local prepaid package',description:p.credits+' service credits'},unit_amount:Math.round(Number(p.price)*100)},quantity:1}],
    success_url:base+'/memberships?package=success&session_id={CHECKOUT_SESSION_ID}',
    cancel_url:base+'/memberships?package=cancelled',
    metadata:{payment_kind:'business_package',customer_package_id:p.customer_package_id,package_id:p.package_id,business_id:p.business_id,customer_id:user.id},
    payment_intent_data:{metadata:{payment_kind:'business_package',customer_package_id:p.customer_package_id,package_id:p.package_id,business_id:p.business_id,customer_id:user.id}},
   },{idempotencyKey:'package-checkout:'+p.customer_package_id});
   if(!session.url)throw new Error('Stripe Checkout URL was not returned');
   const {error:attachError}=await admin.rpc('attach_package_checkout_session',{p_customer_package_id:p.customer_package_id,p_session_id:session.id});
   if(attachError)throw attachError;
   return json({url:session.url,customerPackageId:p.customer_package_id,reused:false});
  }

  if(action==='PORTAL'||action==='CANCEL_AT_PERIOD_END'||action==='RESUME'){
   const membershipId=String(body.membershipId??'');
   if(!membershipId)return json({error:'Membership is required.'},400);
   const {data:m,error}=await userClient.from('customer_memberships').select('id,stripe_customer_id,stripe_subscription_id,status').eq('id',membershipId).eq('customer_id',user.id).maybeSingle();
   if(error)throw error;
   if(!m)return json({error:'Membership not found.'},404);
   if(action==='PORTAL'){
    if(!m.stripe_customer_id)return json({error:'No billing account exists for this membership yet.'},400);
    const portal=await stripe.billingPortal.sessions.create({customer:m.stripe_customer_id,return_url:base+'/memberships'});
    return json({url:portal.url});
   }
   if(!m.stripe_subscription_id)return json({error:'No active Stripe subscription exists.'},400);
   const subscription=await stripe.subscriptions.update(m.stripe_subscription_id,{cancel_at_period_end:action==='CANCEL_AT_PERIOD_END'});
   return json({ok:true,status:subscription.status,cancelAtPeriodEnd:subscription.cancel_at_period_end});
  }

  return json({error:'Unsupported action.'},400);
 }catch(error){
  console.error('membership_billing_failed',{action,userId:user.id,message:error instanceof Error?error.message:'unknown'});
  return json({error:error instanceof Error?error.message:'Membership billing request failed.'},400);
 }
});