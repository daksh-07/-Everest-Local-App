import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]??char))}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL');const anon=Deno.env.get('SUPABASE_ANON_KEY');const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');const resendKey=Deno.env.get('RESEND_API_KEY');
  if(!url||!anon||!service)throw new Error('Support service is not configured');
  const auth=req.headers.get('Authorization')??'';const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:'Authentication required'},401);
  const payload=await req.json().catch(()=>({}));const requestId=typeof payload.requestId==='string'?payload.requestId:'';if(!requestId)return json({error:'Request reference required'},400);
  const admin=createClient(url,service,{auth:{persistSession:false}});const {data:ticket,error}=await admin.from('support_requests').select('id,user_id,category,subject,message,created_at,email_status').eq('id',requestId).eq('user_id',user.id).single();if(error||!ticket)return json({error:'Support request not found'},404);
  if(ticket.email_status==='SENT')return json({ok:true});
  if(!resendKey){await admin.from('support_requests').update({email_status:'FAILED',updated_at:new Date().toISOString()}).eq('id',ticket.id);return json({error:'Email delivery is not configured. Your request was saved.'},503)}
  const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':`support-${ticket.id}`},body:JSON.stringify({from:Deno.env.get('SUPPORT_FROM_EMAIL')??'Everest Local Support <support@everestlocal.com.au>',to:['dakshgolani5@gmail.com'],reply_to:user.email,subject:`[Everest Local] ${ticket.subject}`,html:`<h2>New support request</h2><p><strong>Category:</strong> ${escapeHtml(ticket.category)}</p><p><strong>User:</strong> ${escapeHtml(user.email??user.id)}</p><p><strong>Ticket:</strong> ${escapeHtml(ticket.id)}</p><p>${escapeHtml(ticket.message).replace(/\n/g,'<br>')}</p>`})});
  await admin.from('support_requests').update({email_status:result.ok?'SENT':'FAILED',updated_at:new Date().toISOString()}).eq('id',ticket.id);
  if(!result.ok)return json({error:'Your request was saved, but email delivery is delayed.'},502);return json({ok:true});
 }catch(error){console.error('support_email_failed',{message:error instanceof Error?error.message:'unknown'});return json({error:'Support email could not be sent.'},500)}
});
