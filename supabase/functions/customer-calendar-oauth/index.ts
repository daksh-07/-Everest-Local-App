import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const enc=new TextEncoder();
const b64u=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const fromB64u=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
type State={userId:string;nonce:string;exp:number};

async function hmac(value:string,secret:string){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))))}
async function signedState(state:State,secret:string){const body=b64u(enc.encode(JSON.stringify(state)));return body+'.'+await hmac(body,secret)}
async function verifyState(value:string,secret:string){const [body,signature]=value.split('.');if(!body||!signature)return null;const expected=await hmac(body,secret);if(expected.length!==signature.length)return null;let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);if(mismatch)return null;const state=JSON.parse(new TextDecoder().decode(fromB64u(body))) as State;return state.exp>Date.now()?state:null}
async function encryptionKey(raw:string){const digest=await crypto.subtle.digest('SHA-256',enc.encode(raw));return crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt'])}
async function encryptTokens(tokens:unknown,secret:string){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await encryptionKey(secret);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(tokens)));return{ciphertext:b64u(new Uint8Array(cipher)),iv:b64u(iv)}}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 const url=Deno.env.get('SUPABASE_URL')??'';
 const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
 const secretKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
 const stateSecret=Deno.env.get('INTEGRATION_OAUTH_STATE_SECRET')??'';
 const tokenSecret=Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')??'';
 const appUrl=Deno.env.get('APP_PUBLIC_URL')??'https://everest-local-app.vercel.app';
 const clientId=Deno.env.get('GOOGLE_CLIENT_ID')??'';
 const clientSecret=Deno.env.get('GOOGLE_CLIENT_SECRET')??'';
 const callback=Deno.env.get('CUSTOMER_CALENDAR_CALLBACK_URL')??(url?url+'/functions/v1/customer-calendar-oauth':'');
 if(!url||!publishable||!secretKey||!stateSecret||!tokenSecret)return json({error:'Calendar integration service is not configured.'},503);
 const admin=createClient(url,secretKey,{auth:{persistSession:false}});

 if(req.method==='GET'){
  const requestUrl=new URL(req.url);
  const code=requestUrl.searchParams.get('code')??'';
  const rawState=requestUrl.searchParams.get('state')??'';
  const state=await verifyState(rawState,stateSecret);
  if(!state||!code)return json({error:'Invalid or expired OAuth callback.'},400);
  if(!clientId||!clientSecret||!callback)return json({error:'Google Calendar OAuth credentials are not configured.'},503);
  const {data:userData,error:userError}=await admin.auth.admin.getUserById(state.userId);
  if(userError||!userData.user)return json({error:'Everest account is no longer available.'},403);
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,redirect_uri:callback,grant_type:'authorization_code'})});
  if(!tokenResponse.ok)return json({error:'Google token exchange failed.'},502);
  const tokens=await tokenResponse.json();
  const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}});
  if(!profileResponse.ok)return json({error:'Google account lookup failed.'},502);
  const profile=await profileResponse.json();
  const accountId=String(profile.sub??profile.id??'');
  const label=String(profile.email??'Google Calendar');
  if(!accountId)return json({error:'Google account identity missing.'},502);
  const {data:existing}=await admin.from('customer_calendar_connections').select('id').eq('user_id',state.userId).eq('provider','GOOGLE_CALENDAR').eq('provider_account_id',accountId).maybeSingle();
  const connectionId=existing?.id??crypto.randomUUID();
  const {error:connectionError}=await admin.from('customer_calendar_connections').upsert({
   id:connectionId,user_id:state.userId,provider:'GOOGLE_CALENDAR',provider_account_id:accountId,account_label:label,status:'CONNECTED',
   granted_scopes:String(tokens.scope??'').split(' ').filter(Boolean),provider_calendar_id:'primary',calendar_label:'Primary calendar',sync_enabled:true,
   import_busy_time:true,export_marketplace_bookings:true,allow_ask_everest:true,last_error_code:null,connected_at:new Date().toISOString(),revoked_at:null,updated_at:new Date().toISOString()
  },{onConflict:'id'});
  if(connectionError)return json({error:'Calendar connection could not be saved.'},500);
  const encrypted=await encryptTokens(tokens,tokenSecret);
  const expiresAt=tokens.expires_in?new Date(Date.now()+Number(tokens.expires_in)*1000).toISOString():null;
  const {error:credentialError}=await admin.from('customer_calendar_oauth_credentials').upsert({
   connection_id:connectionId,user_id:state.userId,token_ciphertext:encrypted.ciphertext,token_iv:encrypted.iv,token_expires_at:expiresAt,updated_at:new Date().toISOString()
  },{onConflict:'connection_id'});
  if(credentialError)return json({error:'Calendar credentials could not be stored.'},500);
  await admin.from('audit_logs').insert({actor_id:state.userId,action:'CUSTOMER_CALENDAR_CONNECTED',entity_type:'customer_calendar_connection',entity_id:connectionId,metadata:{provider:'GOOGLE_CALENDAR'}});
  return Response.redirect(appUrl+'/customer-calendar?connected=google',302);
 }

 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 const authorization=req.headers.get('Authorization')??'';
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:{user}}=await userClient.auth.getUser();
 if(!user)return json({error:'Authentication required.'},401);
 const body=await req.json().catch(()=>({}));
 const action=String(body.action??'');
 if(action==='BEGIN'){
  if(!clientId||!clientSecret||!callback)return json({error:'Google Calendar OAuth credentials are not configured.'},503);
  const state=await signedState({userId:user.id,nonce:crypto.randomUUID(),exp:Date.now()+10*60*1000},stateSecret);
  const params=new URLSearchParams({
   client_id:clientId,redirect_uri:callback,response_type:'code',
   scope:['openid','email','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.freebusy'].join(' '),
   state,access_type:'offline',prompt:'consent',include_granted_scopes:'true'
  });
  return json({authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
 }
 if(action==='DISCONNECT'){
  const connectionId=String(body.connectionId??'');
  const {data:connection}=await admin.from('customer_calendar_connections').select('id').eq('id',connectionId).eq('user_id',user.id).maybeSingle();
  if(!connection)return json({error:'Calendar connection not found.'},404);
  await admin.from('customer_calendar_oauth_credentials').delete().eq('connection_id',connectionId).eq('user_id',user.id);
  await admin.from('customer_calendar_connections').update({status:'REVOKED',revoked_at:new Date().toISOString(),sync_enabled:false,updated_at:new Date().toISOString()}).eq('id',connectionId).eq('user_id',user.id);
  await admin.from('audit_logs').insert({actor_id:user.id,action:'CUSTOMER_CALENDAR_DISCONNECTED',entity_type:'customer_calendar_connection',entity_id:connectionId,metadata:{provider:'GOOGLE_CALENDAR'}});
  return json({disconnected:true});
 }
 return json({error:'Unsupported action.'},400);
});
