import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type ConnectAction='status'|'onboard';
type ConnectRequest={action?:unknown;business_id?:unknown};

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

function cleanRequirements(account:Stripe.Account){
 const current=account.requirements?.currently_due??[];
 const past=account.requirements?.past_due??[];
 return [...new Set([...past,...current])];
}
function connectStatus(account:Stripe.Account){
 if(account.details_submitted&&account.charges_enabled&&account.payouts_enabled)return 'ACTIVE';
 if((account.requirements?.past_due?.length??0)>0||Boolean(account.requirements?.disabled_reason))return 'RESTRICTED';
 return 'PENDING';
}
function connectSnapshot(account:Stripe.Account){
 const controller=account.controller as {fees?:{payer?:string}}|undefined;
 return {
  stripe_connected_account_id:account.id,
  stripe_connect_status:connectStatus(account),
  stripe_details_submitted:Boolean(account.details_submitted),
  stripe_charges_enabled:Boolean(account.charges_enabled),
  stripe_payouts_enabled:Boolean(account.payouts_enabled),
  stripe_bank_connected:Boolean(account.external_accounts?.data?.length),
  stripe_requirements_due:cleanRequirements(account),
  stripe_connect_fee_payer:controller?.fees?.payer==='application'?'PLATFORM':'ACCOUNT',
  stripe_connect_synced_at:new Date().toISOString(),
 };
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 const url=Deno.env.get('SUPABASE_URL');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const stripeKey=Deno.env.get('STRIPE_SECRET_KEY');
 const appUrl=Deno.env.get('APP_PUBLIC_URL');
 if(!url||!service||!stripeKey)return json({error:'Stripe Connect is not configured'},503);

 const auth=req.headers.get('Authorization');
 if(!auth)return json({error:'Authentication required'},401);
 const token=auth.replace(/^Bearer\s+/i,'').trim();
 if(!token)return json({error:'Authentication required'},401);

 const input=await req.json().catch(()=>null) as ConnectRequest|null;
 const action=(typeof input?.action==='string'?input.action.toLowerCase():'status') as ConnectAction;
 const businessId=typeof input?.business_id==='string'?input.business_id.trim():'';
 if(!businessId||!['status','onboard'].includes(action))return json({error:'Invalid request'},400);

 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:{user},error:userError}=await admin.auth.getUser(token);
 if(userError||!user){
  console.log('stripe_connect_auth_failed',{businessId,action,reason:userError?.message??'user_missing'});
  return json({error:'Invalid session'},401);
 }

 const {data:membership,error:membershipError}=await admin.from('business_members')
  .select('member_role').eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
 if(membershipError){
  console.log('stripe_connect_access_failed',{businessId,action,stage:'membership',message:membershipError.message});
  return json({error:'Business access could not be verified'},500);
 }
 if(!membership)return json({error:'Business access is required'},403);

 const {data:business,error:businessError}=await admin.from('businesses')
  .select('id,name,description,email,status,verification_status,stripe_connected_account_id,stripe_connect_status')
  .eq('id',businessId).maybeSingle();
 if(businessError){
  console.log('stripe_connect_access_failed',{businessId,action,stage:'business',message:businessError.message});
  return json({error:'Business could not be loaded'},500);
 }
 if(!business)return json({error:'Business not found'},404);

 async function sync(account:Stripe.Account){
  const snapshot=connectSnapshot(account);
  const {error}=await admin.from('businesses').update(snapshot).eq('id',businessId);
  if(error)throw error;

  // If Stripe later restricts the account, stop new paid commitments immediately.
  if(snapshot.stripe_connect_status!=='ACTIVE'){
   await Promise.all([
    admin.from('services').update({active:false,updated_at:new Date().toISOString()}).eq('business_id',businessId).eq('active',true),
    admin.from('products').update({status:'PAUSED',updated_at:new Date().toISOString()}).eq('business_id',businessId).eq('status','ACTIVE'),
   ]);
  }
  return snapshot;
 }

 try{
  const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
  let connectedId=typeof business.stripe_connected_account_id==='string'?business.stripe_connected_account_id:'';

  if(connectedId){
   try{
    const account=await stripe.accounts.retrieve(connectedId);
    if('deleted' in account&&account.deleted){
     connectedId='';
     await admin.from('businesses').update({
      stripe_connected_account_id:null,
      stripe_connect_status:'NOT_CONNECTED',
      stripe_details_submitted:false,
      stripe_charges_enabled:false,
      stripe_payouts_enabled:false,
      stripe_bank_connected:false,
      stripe_requirements_due:[],
      stripe_connect_synced_at:new Date().toISOString(),
     }).eq('id',businessId);
    }else{
     const snapshot=await sync(account as Stripe.Account);
     if(action==='status')return json({
      ...snapshot,
      ready:snapshot.stripe_connect_status==='ACTIVE',
      requirements_due:snapshot.stripe_requirements_due,
     });
    }
   }catch(error){
    const code=(error as {code?:string}).code;
    if(code!=='resource_missing')throw error;
    connectedId='';
    await admin.from('businesses').update({
     stripe_connected_account_id:null,
     stripe_connect_status:'NOT_CONNECTED',
     stripe_details_submitted:false,
     stripe_charges_enabled:false,
     stripe_payouts_enabled:false,
     stripe_bank_connected:false,
     stripe_requirements_due:[],
     stripe_connect_synced_at:new Date().toISOString(),
    }).eq('id',businessId);
   }
  }

  if(action==='status'){
   return json({
    stripe_connected_account_id:null,
    stripe_connect_status:'NOT_CONNECTED',
    stripe_details_submitted:false,
    stripe_charges_enabled:false,
    stripe_payouts_enabled:false,
    stripe_bank_connected:false,
    stripe_requirements_due:[],
    stripe_connect_fee_payer:'ACCOUNT',
    ready:false,
    requirements_due:[],
   });
  }

  if(business.status!=='ACTIVE'||business.verification_status!=='VERIFIED'){
   return json({error:'Verify your business before setting up payouts'},409);
  }

  if(!appUrl)return json({error:'APP_PUBLIC_URL is required for Stripe onboarding'},503);
  const preflightBase=new URL(appUrl);
  if(preflightBase.protocol!=='https:'&&preflightBase.hostname!=='localhost'&&preflightBase.hostname!=='127.0.0.1'){
   return json({error:'APP_PUBLIC_URL must use HTTPS for Stripe onboarding'},503);
  }

  if(!connectedId){
   const params:Stripe.AccountCreateParams={
    country:'AU',
    email:business.email||undefined,
    business_profile:{
     name:business.name,
     product_description:business.description?.trim()||'Local products and services sold through Everest Local',
    },
    capabilities:{
     card_payments:{requested:true},
     transfers:{requested:true},
    },
    controller:{
     fees:{payer:'account'},
     losses:{payments:'stripe'},
     requirement_collection:'stripe',
     stripe_dashboard:{type:'full'},
    },
    metadata:{everest_business_id:businessId},
   };
   const account=await stripe.accounts.create(params,{idempotencyKey:`everest-connect-${businessId}`});
   connectedId=account.id;
   await sync(account);
  }

  const base=preflightBase;
  const refreshUrl=new URL('/business-payouts',base);
  refreshUrl.searchParams.set('stripe','refresh');
  refreshUrl.searchParams.set('businessId',businessId);
  const returnUrl=new URL('/business-payouts',base);
  returnUrl.searchParams.set('stripe','return');
  returnUrl.searchParams.set('businessId',businessId);

  const link=await stripe.accountLinks.create({
   account:connectedId,
   type:'account_onboarding',
   refresh_url:refreshUrl.toString(),
   return_url:returnUrl.toString(),
   collection_options:{fields:'eventually_due'},
  });

  const account=await stripe.accounts.retrieve(connectedId);
  if(!('deleted' in account&&account.deleted))await sync(account as Stripe.Account);
  return json({url:link.url,expires_at:link.expires_at,stripe_connected_account_id:connectedId});
 }catch(error){
  const stripeError=error as {code?:string;type?:string;requestId?:string;raw?:{requestId?:string}};
  const message=error instanceof Error?error.message:'unknown';
  console.log('stripe_connect_failed',{
   businessId,
   action,
   message,
   code:stripeError.code??null,
   type:stripeError.type??null,
   requestId:stripeError.requestId??stripeError.raw?.requestId??null,
  });
  if(message.includes("signed up for Connect")){
   return json({error:'Everest Local Stripe Connect is not activated yet. Complete Connect setup in the Stripe Dashboard, then try again.'},503);
  }
  return json({error:'Stripe payout setup could not be completed. Please try again.'},500);
 }
});
