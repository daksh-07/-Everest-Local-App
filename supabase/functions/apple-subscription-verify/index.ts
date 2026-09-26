import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {SignJWT,importPKCS8} from 'https://esm.sh/jose@5.10.0';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const PRODUCT_ID='com.everestlocal.pro.monthly';

type AppleTransaction={transactionId?:string;originalTransactionId?:string;bundleId?:string;productId?:string;expiresDate?:number;revocationDate?:number;environment?:string};

function decodeJwsPayload<T>(jws:string):T{
 const part=jws.split('.')[1];
 if(!part)throw new Error('Malformed Apple signed transaction.');
 const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
 const padded=normalized+'='.repeat((4-normalized.length%4)%4);
 return JSON.parse(atob(padded)) as T;
}

async function appleJwt(){
 const issuer=Deno.env.get('APPLE_IAP_ISSUER_ID')??'';
 const keyId=Deno.env.get('APPLE_IAP_KEY_ID')??'';
 const bundleId=Deno.env.get('APPLE_BUNDLE_ID')??'com.everestlocal.app';
 const rawKey=(Deno.env.get('APPLE_IAP_PRIVATE_KEY')??'').replace(/\\n/g,'\n');
 if(!issuer||!keyId||!rawKey)throw new Error('Apple IAP server credentials are not configured.');
 const key=await importPKCS8(rawKey,'ES256');
 const now=Math.floor(Date.now()/1000);
 return new SignJWT({bid:bundleId}).setProtectedHeader({alg:'ES256',kid:keyId,typ:'JWT'}).setIssuer(issuer).setAudience('appstoreconnect-v1').setIssuedAt(now).setExpirationTime(now+300).sign(key);
}

async function fetchAppleTransaction(transactionId:string){
 const token=await appleJwt();
 const request=async(base:string)=>{
  const res=await fetch(base+'/inApps/v1/transactions/'+encodeURIComponent(transactionId),{headers:{Authorization:'Bearer '+token}});
  const data=await res.json().catch(()=>({}));
  return {res,data};
 };
 let response=await request('https://api.storekit.apple.com');
 if(response.res.status===404)response=await request('https://api.storekit-sandbox.apple.com');
 if(!response.res.ok)throw new Error('Apple could not verify this transaction.');
 const signed=String(response.data?.signedTransactionInfo??'');
 if(!signed)throw new Error('Apple transaction payload is missing.');
 return decodeJwsPayload<AppleTransaction>(signed);
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')??'';
  const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
  if(!url||!publishable||!service)return json({error:'Server configuration unavailable.'},503);
  const auth=req.headers.get('Authorization')??'';
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const {data:{user}}=await userClient.auth.getUser();
  if(!user)return json({error:'Authentication required.'},401);
  const body=await req.json().catch(()=>({}));
  const businessId=String(body.businessId??'');
  const transactionId=String(body.transactionId??'');
  if(!businessId||!transactionId)return json({error:'Business and transaction are required.'},400);
  const {data:membership}=await userClient.from('business_members').select('business_id').eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
  if(!membership)return json({error:'Business access unavailable.'},403);
  const transaction=await fetchAppleTransaction(transactionId);
  const expectedBundle=Deno.env.get('APPLE_BUNDLE_ID')??'com.everestlocal.app';
  if(transaction.bundleId!==expectedBundle)return json({error:'Apple transaction belongs to another app.'},400);
  if(transaction.productId!==PRODUCT_ID)return json({error:'Unexpected Apple subscription product.'},400);
  if(!transaction.transactionId||!transaction.originalTransactionId)return json({error:'Apple transaction identifiers are missing.'},400);
  const active=!transaction.revocationDate&&Number(transaction.expiresDate??0)>Date.now();
  const periodEnd=transaction.expiresDate?new Date(transaction.expiresDate).toISOString():null;
  const {error}=await admin.from('business_subscriptions').upsert({
   business_id:businessId,billing_provider:'APPLE',apple_original_transaction_id:transaction.originalTransactionId,
   apple_transaction_id:transaction.transactionId,apple_product_id:transaction.productId,apple_environment:transaction.environment??null,
   status:active?'ACTIVE':'CANCELED',current_period_end:periodEnd,cancel_at_period_end:false,updated_at:new Date().toISOString(),
  },{onConflict:'business_id'});
  if(error)throw error;
  return json({active,status:active?'ACTIVE':'CANCELED',currentPeriodEnd:periodEnd,provider:'APPLE'});
 }catch(error){
  console.error('apple_subscription_verify_failed: '+(error instanceof Error?error.message:'unknown'));
  return json({error:'Apple subscription could not be verified.'},500);
 }
});