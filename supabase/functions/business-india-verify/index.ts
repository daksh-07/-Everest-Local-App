import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const ENTITY_TYPES=new Set(['SOLE_PROPRIETOR','PARTNERSHIP','LLP','PRIVATE_LIMITED','PUBLIC_LIMITED','OTHER']);

function secretKey(){
 const raw=Deno.env.get('SUPABASE_SECRET_KEYS');
 if(raw){try{const parsed=JSON.parse(raw) as Record<string,unknown>;if(typeof parsed.default==='string')return parsed.default;}catch{/* use legacy key */}}
 return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
}
function clean(value:unknown,max=200){return typeof value==='string'?value.trim().slice(0,max):''}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL');
 const anon=Deno.env.get('SUPABASE_ANON_KEY');
 const service=secretKey();
 if(!url||!anon||!service)return json({error:'India verification is temporarily unavailable.'},503);
 const authorization=req.headers.get('Authorization');
 if(!authorization)return json({error:'Authentication required.'},401);

 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
 const {data:{user},error:authError}=await userClient.auth.getUser();
 if(authError||!user)return json({error:'Invalid session.'},401);
 const admin=createClient(url,service);

 try{
  const body=await req.json() as Record<string,unknown>;
  const businessId=clean(body.business_id,64);
  const legalName=clean(body.legal_name,180);
  const entityType=clean(body.entity_type,40).toUpperCase();
  const gstin=clean(body.gstin,15).toUpperCase();

  if(!businessId)return json({error:'We could not identify your business.'},400);
  if(legalName.length<2)return json({error:'Enter the legal or proprietor name used for this business.'},422);
  if(!ENTITY_TYPES.has(entityType))return json({error:'Choose a valid business type.'},422);
  if(gstin&&!/^[0-9A-Z]{15}$/.test(gstin))return json({error:'GSTIN must be 15 alphanumeric characters.'},422);

  const {data:business,error:businessError}=await admin.from('businesses')
   .select('id,owner_id,name,country,verification_status')
   .eq('id',businessId).maybeSingle();
  if(businessError||!business)return json({error:'Business not found.'},404);
  if(String(business.country).toLowerCase()!=='india')return json({error:'This verification flow is only for Everest India businesses.'},409);

  let authorized=business.owner_id===user.id;
  if(!authorized){
   const {data:member}=await admin.from('business_members')
    .select('member_role,status').eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
   authorized=member?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(String(member.member_role));
  }
  if(!authorized)return json({error:'You are not authorized to verify this business.'},403);
  if(business.verification_status==='VERIFIED')return json({error:'This business is already verified.'},409);

  const {data:existing,error:existingError}=await admin.from('business_verifications')
   .select('id').eq('business_id',businessId).eq('status','PENDING').maybeSingle();
  if(existingError)return json({error:'Verification could not be prepared.'},500);

  const payload={
   business_id:businessId,
   submitted_by:user.id,
   status:'PENDING',
   abn:null,
   verification_provider:'INDIA_MANUAL',
   provider_reference:gstin||null,
   provider_status:'EVIDENCE_SUBMITTED',
   provider_entity_name:legalName,
   provider_entity_type:entityType,
   provider_match:null,
   provider_message:gstin
    ?'GSTIN supplied by applicant. Everest manual review is required before marketplace verification.'
    :'No GSTIN supplied. Everest manual review is required before marketplace verification.',
   documents:[],
   automated_decision:'NOT_RUN',
   automated_rejection_reason:null,
   automated_checked_at:null,
  };

  let verificationId='';
  if(existing?.id){
   const {data,error}=await admin.from('business_verifications').update(payload).eq('id',existing.id).select('id').single();
   if(error)return json({error:'Verification could not be updated.'},500);
   verificationId=data.id;
  }else{
   const {data,error}=await admin.from('business_verifications').insert(payload).select('id').single();
   if(error)return json({error:'Verification could not be submitted.'},500);
   verificationId=data.id;
  }

  const {error:updateError}=await admin.from('businesses').update({verification_status:'PENDING'}).eq('id',businessId);
  if(updateError)return json({error:'Verification status could not be updated.'},500);

  return json({verification_id:verificationId,status:'PENDING',provider:'INDIA_MANUAL'});
 }catch(error){
  console.error('business_india_verify_failed',{message:error instanceof Error?error.message:'unknown'});
  return json({error:'India business verification could not be submitted. Please try again.'},500);
 }
});
