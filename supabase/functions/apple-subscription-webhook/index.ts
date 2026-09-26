import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {SignJWT,importPKCS8} from 'https://esm.sh/jose@5.10.0';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const PRODUCT_ID='com.everestlocal.pro.monthly';
type AppleTransaction={transactionId?:string;originalTransactionId?:string;bundleId?:string;productId?:string;expiresDate?:number;revocationDate?:number;environment?:string};
type AppleRenewal={autoRenewStatus?:number};

function decodeJwsPayload<T>(jws:string):T{
 const part=jws.split('.')[1];if(!part)throw new Error('Malformed Apple signed payload.');
 const normalized=part.replace(/-/g,'+').replace(/_/g,'/');const padded=normalized+'='.repeat((4-normalized.length%4)%4);
 return JSON.parse(atob(padded)) as T;
}
async function appleJwt(){
 const issuer=Deno.env.get('APPLE_IAP_ISSUER_ID')??'';const keyId=Deno.env.get('APPLE_IAP_KEY_ID')??'';
 const bundleId=Deno.env.get('APPLE_BUNDLE_ID')??'com.everestlocal.app';const rawKey=(Deno.env.get('APPLE_IAP_PRIVATE_KEY')??'').replace(/\\n/g,'\n');
 if(!issuer||!keyId||!rawKey)throw new Error('Apple IAP server credentials are not configured.');
 const key=await importPKCS8(rawKey,'ES256');const now=Math.floor(Date.now()/1000);
 return new SignJWT({bid:bundleId}).setProtectedHeader({alg:'ES256',kid:keyId,typ:'JWT'}).setIssuer(issuer).setAudience('appstoreconnect-v1').setIssuedAt(now).setExpirationTime(now+300).sign(key);
}
async function fetchAppleTransaction(transactionId:string){
 const token=await appleJwt();
 const request=async(base:string)=>{const res=await fetch(base+'/inApps/v1/transactions/'+encodeURIComponent(transactionId),{headers:{Authorization:'Bearer '+token}});const data=await res.json().catch(()=>({}));return {res,data};};
 let response=await request('https://api.storekit.apple.com');if(response.res.status===404)response=await request('https://api.storekit-sandbox.apple.com');
 if(!response.res.ok)throw new Error('Apple transaction lookup failed.');
 const signed=String(response.data?.signedTransactionInfo??'');if(!signed)throw new Error('Apple transaction payload is missing.');
 return decodeJwsPayload<AppleTransaction>(signed);
}

Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')??'';const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
  if(!url||!service)return json({error:'Server unavailable'},503);const admin=createClient(url,service,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({}));const signedPayload=String(body.signedPayload??'');if(!signedPayload)return json({received:true});
  const notification=decodeJwsPayload<{data?:{signedTransactionInfo?:string;signedRenewalInfo?:string}}>(signedPayload);
  const signedTransaction=String(notification.data?.signedTransactionInfo??'');if(!signedTransaction)return json({received:true});
  const hinted=decodeJwsPayload<AppleTransaction>(signedTransaction);const transactionId=String(hinted.transactionId??'');const originalTransactionId=String(hinted.originalTransactionId??'');
  if(!transactionId||!originalTransactionId)return json({received:true});
  const {data:existing}=await admin.from('business_subscriptions').select('business_id').eq('apple_original_transaction_id',originalTransactionId).maybeSingle();
  if(!existing?.business_id)return json({received:true,ignored:true});
  const authoritative=await fetchAppleTransaction(transactionId);const expectedBundle=Deno.env.get('APPLE_BUNDLE_ID')??'com.everestlocal.app';
  if(authoritative.bundleId!==expectedBundle||authoritative.productId!==PRODUCT_ID)return json({received:true,ignored:true});
  let cancelAtPeriodEnd=false;const signedRenewal=String(notification.data?.signedRenewalInfo??'');
  if(signedRenewal){const renewal=decodeJwsPayload<AppleRenewal>(signedRenewal);cancelAtPeriodEnd=renewal.autoRenewStatus===0;}
  const active=!authoritative.revocationDate&&Number(authoritative.expiresDate??0)>Date.now();
  const {error}=await admin.from('business_subscriptions').update({
   billing_provider:'APPLE',apple_transaction_id:authoritative.transactionId??transactionId,apple_product_id:authoritative.productId??PRODUCT_ID,
   apple_environment:authoritative.environment??null,status:active?'ACTIVE':'CANCELED',
   current_period_end:authoritative.expiresDate?new Date(authoritative.expiresDate).toISOString():null,cancel_at_period_end:cancelAtPeriodEnd,updated_at:new Date().toISOString(),
  }).eq('business_id',existing.business_id);
  if(error)throw error;return json({received:true});
 }catch(error){
  console.error('apple_subscription_webhook_failed: '+(error instanceof Error?error.message:'unknown'));
  return json({error:'Notification processing failed'},500);
 }
});