import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

async function stripePost(path:string,secret:string,params:Record<string,string>){
 const body=new URLSearchParams();
 for(const [key,value] of Object.entries(params))body.set(key,value);
 const response=await fetch('https://api.stripe.com'+path,{
  method:'POST',
  headers:{
   Authorization:'Bearer '+secret,
   'Content-Type':'application/x-www-form-urlencoded',
   'Stripe-Version':'2025-07-30.basil',
  },
  body:body.toString(),
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const message=typeof data?.error?.message==='string'?data.error.message:'Stripe request failed.';
  throw new Error(message);
 }
 return data as Record<string,unknown>;
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 try{
  const url=Deno.env.get('SUPABASE_URL')??'';
  const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
  const stripeKey=Deno.env.get('STRIPE_SECRET_KEY')??'';
  const priceId=Deno.env.get('STRIPE_EVEREST_PRO_PRICE_ID')??'';
  const appUrl=(Deno.env.get('APP_PUBLIC_URL')??'https://everest-local-app.vercel.app').replace(/\/$/,'');
  if(!url||!publishable||!service||!stripeKey)return json({error:'Subscription billing is not configured.'},503);

  const auth=req.headers.get('Authorization')??'';
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return json({error:'Authentication required.'},401);

  const body=await req.json().catch(()=>({}));
  const businessId=String(body.businessId??'');
  const action=String(body.action??'CREATE_CHECKOUT');
  if(!businessId)return json({error:'Business is required.'},400);

  const {data:membership,error:membershipError}=await userClient.from('business_members').select('business_id').eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
  if(membershipError||!membership)return json({error:'Business access unavailable.'},403);

  let {data:subRow,error:subError}=await admin.from('business_subscriptions').select('stripe_customer_id,stripe_subscription_id,status').eq('business_id',businessId).maybeSingle();
  if(subError)return json({error:'Subscription account could not be loaded.'},500);

  if(action==='PORTAL'){
   if(!subRow?.stripe_customer_id)return json({error:'No Stripe subscription account exists yet.'},400);
   const portal=await stripePost('/v1/billing_portal/sessions',stripeKey,{
    customer:subRow.stripe_customer_id,
    return_url:appUrl+'/business-upgrade',
   });
   const portalUrl=typeof portal.url==='string'?portal.url:'';
   if(!portalUrl)return json({error:'Stripe did not return a billing portal URL.'},502);
   return json({url:portalUrl});
  }

  if(action!=='CREATE_CHECKOUT')return json({error:'Unsupported action.'},400);
  if(!priceId)return json({error:'Everest Pro price is not configured yet.'},503);

  if(subRow?.status==='ACTIVE'||subRow?.status==='TRIALING'){
   if(!subRow.stripe_customer_id)return json({error:'Subscription customer record is incomplete.'},500);
   const portal=await stripePost('/v1/billing_portal/sessions',stripeKey,{
    customer:subRow.stripe_customer_id,
    return_url:appUrl+'/business-upgrade',
   });
   const portalUrl=typeof portal.url==='string'?portal.url:'';
   if(!portalUrl)return json({error:'Stripe did not return a billing portal URL.'},502);
   return json({url:portalUrl,alreadySubscribed:true});
  }

  let customerId=subRow?.stripe_customer_id??'';
  if(!customerId){
   const customer=await stripePost('/v1/customers',stripeKey,{
    ...(user.email?{email:user.email}:{}),
    'metadata[everest_business_id]':businessId,
    'metadata[everest_user_id]':user.id,
   });
   customerId=typeof customer.id==='string'?customer.id:'';
   if(!customerId)return json({error:'Stripe customer could not be created.'},502);
   const {error}=await admin.from('business_subscriptions').upsert({
    business_id:businessId,
    stripe_customer_id:customerId,
    status:subRow?.status??'INACTIVE',
    updated_at:new Date().toISOString(),
   },{onConflict:'business_id'});
   if(error)return json({error:'Subscription account could not be prepared.'},500);
   subRow={...(subRow??{}),stripe_customer_id:customerId} as typeof subRow;
  }

  const session=await stripePost('/v1/checkout/sessions',stripeKey,{
   mode:'subscription',
   customer:customerId,
   'line_items[0][price]':priceId,
   'line_items[0][quantity]':'1',
   allow_promotion_codes:'true',
   success_url:appUrl+'/business-upgrade?subscription=success&session_id={CHECKOUT_SESSION_ID}',
   cancel_url:appUrl+'/business-upgrade?subscription=cancelled',
   'metadata[payment_kind]':'everest_pro',
   'metadata[business_id]':businessId,
   'metadata[user_id]':user.id,
   'subscription_data[metadata][payment_kind]':'everest_pro',
   'subscription_data[metadata][business_id]':businessId,
   'subscription_data[metadata][user_id]':user.id,
  });
  const checkoutUrl=typeof session.url==='string'?session.url:'';
  if(!checkoutUrl)return json({error:'Stripe Checkout URL was not returned.'},502);
  return json({url:checkoutUrl});
 }catch(error){
  console.error('business_subscription_billing_failed',{message:error instanceof Error?error.message:'unknown'});
  return json({error:'Subscription checkout could not be started.'},500);
 }
});