import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

function secretKey(){
 const raw=Deno.env.get('SUPABASE_SECRET_KEYS');
 if(raw){try{const parsed=JSON.parse(raw) as Record<string,unknown>;if(typeof parsed.default==='string')return parsed.default;}catch{/* use legacy key */}}
 return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
}

function text(value:unknown,max=500){
 return typeof value==='string'?value.trim().slice(0,max):'';
}
function validPin(value:string){return /^\d{6}$/.test(value)}
function validPhone(value:string){return !value||/^\+?[0-9 ()-]{8,20}$/.test(value)}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL');
 const anon=Deno.env.get('SUPABASE_ANON_KEY');
 const service=secretKey();
 if(!url||!anon||!service)return json({error:'India business setup is temporarily unavailable.'},503);
 const authorization=req.headers.get('Authorization');
 if(!authorization)return json({error:'Authentication required.'},401);

 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
 const {data:{user},error:authError}=await userClient.auth.getUser();
 if(authError||!user)return json({error:'Invalid session.'},401);
 const admin=createClient(url,service);

 let businessId='';
 try{
  const body=await req.json() as Record<string,unknown>;
  const name=text(body.name,120);
  const description=text(body.description,5000);
  const phone=text(body.phone,32);
  const email=text(body.email,180).toLowerCase();
  const locality=text(body.locality,120);
  const city=text(body.city,120);
  const state=text(body.state,120);
  const pinCode=text(body.pin_code,6);
  const categoryId=text(body.category_id,64);
  const services=Array.isArray(body.services)?body.services.slice(0,60):[];
  const area=body.service_area&&typeof body.service_area==='object'?body.service_area as Record<string,unknown>:null;

  if(name.length<2)return json({error:'Enter your business name.'},422);
  if(!city||!state)return json({error:'City and state are required.'},422);
  if(!validPin(pinCode))return json({error:'Enter a valid 6-digit PIN code.'},422);
  if(!validPhone(phone))return json({error:'Enter a valid Indian business phone number.'},422);
  if(!categoryId)return json({error:'Choose a primary business category.'},422);
  if(!services.length)return json({error:'Select at least one service.'},422);

  const mapped=services.map(item=>{
   const row=item&&typeof item==='object'?item as Record<string,unknown>:{};
   const serviceDefinitionId=text(row.service_definition_id,64);
   const mode=text(row.delivery_mode,10);
   if(!serviceDefinitionId||!['LOCAL','REMOTE','BOTH'].includes(mode))throw new Error('INVALID_SERVICE');
   return {service_definition_id:serviceDefinitionId,delivery_mode:mode};
  });

  const serviceArea=area?{
   suburb:text(area.locality,120),
   city:text(area.city,120),
   state:text(area.state,120),
   postcode:text(area.pin_code,6)||null,
  }:null;

  const {data,error}=await userClient.rpc('create_business_setup',{
   p_name:name,p_description:description,p_category_id:categoryId,
   p_abn:null,p_phone:phone||null,p_email:email||null,
   p_suburb:locality||city,p_city:city,p_state:state,p_postcode:pinCode,
   p_services:mapped,p_service_area:serviceArea,
  });
  if(error){
   console.error('india_business_setup_rpc_failed',{code:error.code});
   return json({error:'India business setup could not be completed. Please review your details and try again.'},400);
  }
  businessId=typeof data==='string'?data:'';
  if(!businessId)return json({error:'India business setup returned an invalid reference.'},500);

  const {error:updateError}=await admin.from('businesses').update({
   country:'India',
   abn:null,
   stripe_connected_account_id:null,
   stripe_connect_status:'NOT_CONNECTED',
   stripe_details_submitted:false,
   stripe_charges_enabled:false,
   stripe_payouts_enabled:false,
   stripe_bank_connected:false,
   stripe_requirements_due:[],
   stripe_connect_synced_at:null,
  }).eq('id',businessId).eq('owner_id',user.id);
  if(updateError){
   console.error('india_business_country_update_failed',{code:updateError.code});
   await admin.from('businesses').delete().eq('id',businessId).eq('owner_id',user.id);
   return json({error:'India business setup could not be finalized. Please try again.'},500);
  }

  return json({business_id:businessId,country:'India',verification_status:'UNVERIFIED'});
 }catch(error){
  if(businessId)await admin.from('businesses').delete().eq('id',businessId).eq('owner_id',user.id);
  console.error('india_business_setup_failed',{message:error instanceof Error?error.message:'unknown'});
  return json({error:'India business setup could not be completed. Please try again.'},500);
 }
});
