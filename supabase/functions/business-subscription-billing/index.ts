import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 const url=Deno.env.get('SUPABASE_URL')??'';
 const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
 const stripeKey=Deno.env.get('STRIPE_SECRET_KEY')??'';
 // A price is deployment configuration, never source code.  This prevents a
 // test/old price from being charged after a production deployment.
 const priceId=Deno.env.get('STRIPE_EVEREST_PRO_PRICE_ID')??'';
 const appUrl=(Deno.env.get('APP_PUBLIC_URL')??'https://everest-local-app.vercel.app').replace(/\/$/,'');
 if(!url||!publishable||!service||!stripeKey)return json({error:'Subscription billing is not configured.'},503);

 const auth=req.headers.get('Authorization')??'';
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const admin=createClient(url,service,{auth:{persistSession:false}});
 const {data:{user}}=await userClient.auth.getUser();
 if(!user)return json({error:'Authentication required.'},401);

 const body=await req.json().catch(()=>({}));
 const businessId=String(body.businessId??'');
 const action=String(body.action??'CREATE_CHECKOUT');
 if(!businessId)return json({error:'Business is required.'},400);

 const {data:membership}=await userClient.from('business_members').select('business_id').eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
 if(!membership)return json({error:'Business access unavailable.'},403);

 const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
 let {data:subRow}=await admin.from('business_subscriptions').select('stripe_customer_id,stripe_subscription_id,status').eq('business_id',businessId).maybeSingle();

 if(action==='PORTAL'){
  if(!subRow?.stripe_customer_id)return json({error:'No Stripe subscription account exists yet.'},400);
  const portal=await stripe.billingPortal.sessions.create({
   customer:subRow.stripe_customer_id,
   return_url:appUrl+'/business-upgrade',
  });
  return json({url:portal.url});
 }

 if(action!=='CREATE_CHECKOUT')return json({error:'Unsupported action.'},400);
 if(!priceId)return json({error:'Everest Pro price is not configured yet.'},503);
 if(subRow?.status==='ACTIVE'||subRow?.status==='TRIALING'){
  if(!subRow.stripe_customer_id)return json({error:'Subscription customer record is incomplete.'},500);
  const portal=await stripe.billingPortal.sessions.create({customer:subRow.stripe_customer_id,return_url:appUrl+'/business-upgrade'});
  return json({url:portal.url,alreadySubscribed:true});
 }

 let customerId=subRow?.stripe_customer_id??'';
 if(!customerId){
  const customer=await stripe.customers.create({
   email:user.email??undefined,
   metadata:{everest_business_id:businessId,everest_user_id:user.id},
  });
  customerId=customer.id;
  const {error}=await admin.from('business_subscriptions').upsert({
   business_id:businessId,
   stripe_customer_id:customerId,
   status:subRow?.status??'INACTIVE',
   updated_at:new Date().toISOString(),
  },{onConflict:'business_id'});
  if(error)return json({error:'Subscription account could not be prepared.'},500);
  subRow={...(subRow??{}),stripe_customer_id:customerId} as typeof subRow;
 }

 const session=await stripe.checkout.sessions.create({
  mode:'subscription',
  customer:customerId,
  line_items:[{price:priceId,quantity:1}],
  allow_promotion_codes:true,
  success_url:appUrl+'/business-upgrade?subscription=success&session_id={CHECKOUT_SESSION_ID}',
  cancel_url:appUrl+'/business-upgrade?subscription=cancelled',
  metadata:{payment_kind:'everest_pro',business_id:businessId,user_id:user.id},
  subscription_data:{metadata:{payment_kind:'everest_pro',business_id:businessId,user_id:user.id}},
 });
 if(!session.url)return json({error:'Stripe Checkout URL was not returned.'},502);
 return json({url:session.url});
});
