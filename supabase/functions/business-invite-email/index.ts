import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

type InviteRequest={invitationId?:unknown};
const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

function escapeHtml(value:unknown){
 return String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');
}
function roleLabel(value:unknown){
 return String(value??'EMPLOYEE').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
}
function safeBaseUrl(value:string|undefined){
 const fallback='https://everest-local-app.vercel.app';
 try{
  const url=new URL(value||fallback);
  if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')return fallback;
  return url.toString().replace(/\/$/,'');
 }catch{return fallback}
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 const url=Deno.env.get('SUPABASE_URL');
 const anon=Deno.env.get('SUPABASE_ANON_KEY');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const resendKey=Deno.env.get('RESEND_API_KEY');
 if(!url||!anon||!service)return json({error:'Invitation delivery is not configured'},503);

 const auth=req.headers.get('Authorization');
 if(!auth)return json({error:'Authentication required'},401);

 const input=await req.json().catch(()=>null) as InviteRequest|null;
 const invitationId=typeof input?.invitationId==='string'?input.invitationId.trim():'';
 if(!invitationId)return json({error:'Invitation id is required'},400);

 const userClient=createClient(url,anon,{
  global:{headers:{Authorization:auth}},
  auth:{autoRefreshToken:false,persistSession:false},
 });
 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:{user},error:userError}=await userClient.auth.getUser();
 if(userError||!user)return json({error:'Invalid session'},401);

 const {data:invite,error:inviteError}=await admin.from('business_staff_invitations')
  .select('id,business_id,email,member_role,display_name,job_title,status,expires_at')
  .eq('id',invitationId).maybeSingle();
 if(inviteError)return json({error:'Invitation could not be loaded'},500);
 if(!invite)return json({error:'Invitation not found'},404);

 const {data:allowed,error:permissionError}=await userClient.rpc('has_business_permission',{
  p_business_id:invite.business_id,
  p_permission:'TEAM_MANAGE',
 });
 if(permissionError||allowed!==true)return json({error:'Team management permission required'},403);
 if(invite.status!=='PENDING')return json({error:'Invitation is no longer pending'},409);
 if(new Date(invite.expires_at).getTime()<=Date.now())return json({error:'Invitation has expired'},409);

 const {data:business,error:businessError}=await admin.from('businesses')
  .select('id,name,email,logo_url').eq('id',invite.business_id).maybeSingle();
 if(businessError||!business)return json({error:'Business could not be loaded'},500);

 if(!resendKey){
  await admin.from('audit_logs').insert({
   actor_id:user.id,action:'BUSINESS_INVITATION_EMAIL_FAILED',entity_type:'BUSINESS',entity_id:invite.business_id,
   metadata:{invitation_id:invite.id,reason:'RESEND_NOT_CONFIGURED'},
  });
  return json({error:'Email delivery is not configured'},503);
 }

 const base=safeBaseUrl(Deno.env.get('APP_PUBLIC_URL'));
 const acceptUrl=base+'/business-invite?invitationId='+encodeURIComponent(invite.id);
 const nativeUrl='everestlocal://business-invite?invitationId='+encodeURIComponent(invite.id);
 const role=roleLabel(invite.member_role);
 const expiry=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'Australia/Sydney'}).format(new Date(invite.expires_at));
 const from=Deno.env.get('BUSINESS_INVITE_FROM_EMAIL')??Deno.env.get('SUPPORT_FROM_EMAIL')??'Everest Local <support@everestlocal.com.au>';
 const subject='You’re invited to join '+business.name+' on Everest Local';
 const title=invite.job_title?.trim()||role;
 const idempotency='business-invite-'+invite.id+'-'+Math.floor(Date.now()/60000);
 const text=[
  'You’ve been invited to join '+business.name+' on Everest Local.',
  'Role: '+role,
  'Position: '+title,
  'Invitation expires: '+expiry,
  '',
  'Accept invitation: '+acceptUrl,
  'Open Everest Local: '+nativeUrl,
  '',
  'For security, sign in or create your Everest Local account using the same email address that received this invitation.',
 ].join('\n');
 const html='<!doctype html><html><body style="margin:0;background:#0b0d0c;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#f5f2eb">'+
 '<div style="max-width:620px;margin:0 auto;padding:38px 22px">'+
 '<div style="font-size:12px;font-weight:800;letter-spacing:2.2px;color:#d6bd8b">EVEREST LOCAL</div>'+
 '<div style="margin-top:20px;background:#121713;border:1px solid #29312c;border-radius:24px;padding:30px">'+
 '<div style="font-size:30px;line-height:1.12;font-weight:850;color:#f7f4ee">Join '+escapeHtml(business.name)+'</div>'+
 '<div style="margin-top:12px;font-size:15px;line-height:1.6;color:#a7afa9">You’ve been invited to work with <strong style="color:#f7f4ee">'+escapeHtml(business.name)+'</strong> inside Everest Local.</div>'+
 '<div style="margin-top:24px;padding:18px;border-radius:16px;background:#0e120f;border:1px solid #252d28">'+
 '<div style="font-size:11px;letter-spacing:1.5px;color:#858d87;font-weight:800">YOUR ACCESS</div>'+
 '<div style="margin-top:10px;font-size:17px;font-weight:800;color:#f7f4ee">'+escapeHtml(role)+'</div>'+
 '<div style="margin-top:5px;font-size:14px;color:#a7afa9">'+escapeHtml(title)+'</div>'+
 '<div style="margin-top:14px;font-size:12px;color:#7f8881">Expires '+escapeHtml(expiry)+'</div></div>'+
 '<a href="'+escapeHtml(acceptUrl)+'" style="display:block;margin-top:24px;text-decoration:none;text-align:center;background:#e6c890;color:#101411;font-size:12px;font-weight:900;letter-spacing:1.2px;padding:17px 18px;border-radius:14px">ACCEPT INVITATION</a>'+
 '<a href="'+escapeHtml(nativeUrl)+'" style="display:block;margin-top:10px;text-decoration:none;text-align:center;color:#d9ddd9;font-size:12px;font-weight:750;padding:13px">OPEN EVEREST LOCAL APP</a>'+
 '<div style="margin-top:20px;font-size:12px;line-height:1.55;color:#7f8881">For security, use the same email address that received this invitation. Everest will verify the account before access is granted.</div>'+
 '</div><div style="padding:18px 4px 0;font-size:11px;line-height:1.5;color:#646b66">If you weren’t expecting this invitation, you can ignore this email.</div>'+
 '</div></body></html>';

 const result=await fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{Authorization:'Bearer '+resendKey,'Content-Type':'application/json','Idempotency-Key':idempotency},
  body:JSON.stringify({
   from,
   to:[invite.email],
   ...(business.email?{reply_to:business.email}:{}),
   subject,
   html,
   text,
  }),
 });
 const response=await result.json().catch(()=>({})) as {id?:string;message?:string;name?:string};
 if(!result.ok){
  console.log('business_invite_email_failed',{invitationId:invite.id,businessId:invite.business_id,status:result.status,message:response.message??response.name??'unknown'});
  await admin.from('audit_logs').insert({
   actor_id:user.id,action:'BUSINESS_INVITATION_EMAIL_FAILED',entity_type:'BUSINESS',entity_id:invite.business_id,
   metadata:{invitation_id:invite.id,http_status:result.status},
  });
  return json({error:'Invitation email could not be sent'},502);
 }

 await admin.from('audit_logs').insert({
  actor_id:user.id,action:'BUSINESS_INVITATION_EMAIL_SENT',entity_type:'BUSINESS',entity_id:invite.business_id,
  metadata:{invitation_id:invite.id,provider:'RESEND',provider_message_id:response.id??null},
 });
 return json({sent:true,messageId:response.id??null});
});
