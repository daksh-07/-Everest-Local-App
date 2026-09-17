import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return json({error:'Account service is not configured'},503);
 const authorization=req.headers.get('Authorization');if(!authorization)return json({error:'Authentication required'},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const {data:{user},error}=await userClient.auth.getUser();if(error||!user)return json({error:'Invalid session'},401);
 const admin=createClient(url,service);
 try{
  // Hard deletion is allowed only for an account with no retained marketplace/audit records.
  // This prevents foreign-key failures and avoids deleting historical transaction identity.
  const {data:canDelete,error:preflightError}=await userClient.rpc('can_delete_my_account');
  if(preflightError)throw preflightError;
  if(canDelete!==true)return json({error:'This account has retained marketplace, business, payment, delivery or audit records and cannot be hard-deleted. Contact support to process the account closure.'},409);
  const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
  if(deleteError)throw deleteError;
  return json({deleted:true});
 }catch(error){console.error('account_delete_failed',{message:error instanceof Error?error.message:'unknown'});return json({error:'Account deletion failed. Please try again or contact support.'},500)}
});
