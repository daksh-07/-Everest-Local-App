import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const enc=new TextEncoder();
const b64u=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const fromB64u=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));

type Provider='GOOGLE_CALENDAR'|'MICROSOFT_CALENDAR'|'GMAIL';
type State={businessId:string;userId:string;provider:Provider;nonce:string;exp:number};
const providerSet=new Set<Provider>(['GOOGLE_CALENDAR','MICROSOFT_CALENDAR','GMAIL']);

async function hmac(value:string,secret:string){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))))}
async function signedState(state:State,secret:string){const body=b64u(enc.encode(JSON.stringify(state)));return body+'.'+await hmac(body,secret)}
async function verifyState(value:string,secret:string){const [body,signature]=value.split('.');if(!body||!signature)return null;const expected=await hmac(body,secret);if(expected.length!==signature.length)return null;let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);if(mismatch)return null;const state=JSON.parse(new TextDecoder().decode(fromB64u(body))) as State;return state.exp>Date.now()&&providerSet.has(state.provider)?state:null}
async function encryptionKey(raw:string){const digest=await crypto.subtle.digest('SHA-256',enc.encode(raw));return crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt'])}
async function encryptTokens(tokens:unknown,secret:string){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await encryptionKey(secret);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(tokens)));return{ciphertext:b64u(new Uint8Array(cipher)),iv:b64u(iv)}}

function config(provider:Provider){
 const callback=Deno.env.get('CRM_INTEGRATION_CALLBACK_URL')??'';
 if(provider==='MICROSOFT_CALENDAR')return{clientId:Deno.env.get('MICROSOFT_CLIENT_ID')??'',clientSecret:Deno.env.get('MICROSOFT_CLIENT_SECRET')??'',authorize:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',scopes:['openid','email','offline_access','User.Read','Calendars.ReadWrite'],callback};
 const calendar=provider==='GOOGLE_CALENDAR';return{clientId:Deno.env.get('GOOGLE_CLIENT_ID')??'',clientSecret:Deno.env.get('GOOGLE_CLIENT_SECRET')??'',authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scopes:calendar?['openid','email','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.freebusy']:['openid','email','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'],callback};
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 const url=Deno.env.get('SUPABASE_URL')??'',publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'',secretKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
 const stateSecret=Deno.env.get('INTEGRATION_OAUTH_STATE_SECRET')??'',tokenSecret=Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')??'',appUrl=Deno.env.get('APP_PUBLIC_URL')??'';
 if(!url||!publishable||!secretKey||!stateSecret||!tokenSecret)return json({error:'Integration service is not configured.'},503);
 const admin=createClient(url,secretKey,{auth:{persistSession:false}});
 if(req.method==='GET'){
  const requestUrl=new URL(req.url),code=requestUrl.searchParams.get('code')??'',rawState=requestUrl.searchParams.get('state')??'';const state=await verifyState(rawState,stateSecret);if(!state||!code)return json({error:'Invalid or expired OAuth callback.'},400);
  const cfg=config(state.provider);if(!cfg.clientId||!cfg.clientSecret||!cfg.callback)return json({error:'Provider credentials are not configured.'},503);
  const tokenResponse=await fetch(cfg.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,code,redirect_uri:cfg.callback,grant_type:'authorization_code'})});
  if(!tokenResponse.ok)return json({error:'Provider token exchange failed.'},502);const tokens=await tokenResponse.json();
  const profileUrl=state.provider==='MICROSOFT_CALENDAR'?'https://graph.microsoft.com/v1.0/me':'https://openidconnect.googleapis.com/v1/userinfo';const profileResponse=await fetch(profileUrl,{headers:{Authorization:'Bearer '+tokens.access_token}});if(!profileResponse.ok)return json({error:'Provider account lookup failed.'},502);const profile=await profileResponse.json();const accountId=String(profile.id??profile.sub??'');const label=String(profile.mail??profile.userPrincipalName??profile.email??'Connected account');if(!accountId)return json({error:'Provider account identity missing.'},502);
  const {data:membership}=await admin.from('business_members').select('business_id').eq('business_id',state.businessId).eq('user_id',state.userId).maybeSingle();if(!membership)return json({error:'Business access is no longer available.'},403);
  const {data:existing}=await admin.from('integration_connections').select('id').eq('business_id',state.businessId).eq('provider',state.provider).eq('provider_account_id',accountId).maybeSingle();const connectionId=existing?.id??crypto.randomUUID();
  const {error:connectionError}=await admin.from('integration_connections').upsert({id:connectionId,business_id:state.businessId,connected_by_user_id:state.userId,provider:state.provider,provider_account_id:accountId,account_label:label,status:'CONNECTED',granted_scopes:String(tokens.scope??'').split(' ').filter(Boolean),secret_reference:'integration_oauth_credentials/'+connectionId,last_error_code:null,connected_at:new Date().toISOString(),revoked_at:null,updated_at:new Date().toISOString()},{onConflict:'id'});if(connectionError)return json({error:'Connection could not be saved.'},500);
  const encrypted=await encryptTokens(tokens,tokenSecret);const expiresAt=tokens.expires_in?new Date(Date.now()+Number(tokens.expires_in)*1000).toISOString():null;const {error:credentialError}=await admin.from('integration_oauth_credentials').upsert({connection_id:connectionId,business_id:state.businessId,token_ciphertext:encrypted.ciphertext,token_iv:encrypted.iv,token_expires_at:expiresAt,updated_at:new Date().toISOString()},{onConflict:'connection_id'});if(credentialError)return json({error:'Credentials could not be stored.'},500);
  if(state.provider!=='GMAIL')await admin.from('calendar_connections').upsert({id:connectionId,business_id:state.businessId,provider:state.provider,calendar_label:'Primary calendar',sync_enabled:true},{onConflict:'id'});
  await admin.from('audit_logs').insert({actor_id:state.userId,action:'INTEGRATION_CONNECTED',entity_type:'integration_connection',entity_id:connectionId,metadata:{business_id:state.businessId,provider:state.provider}});
  return Response.redirect(appUrl+'/business-integrations?connected='+encodeURIComponent(state.provider),302);
 }
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 const authorization=req.headers.get('Authorization')??'';const userClient=createClient(url,publishable,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:'Authentication required.'},401);
 const body=await req.json().catch(()=>({}));const action=String(body.action??'');const businessId=String(body.businessId??'');const {data:membership}=await userClient.from('business_members').select('business_id').eq('business_id',businessId).eq('user_id',user.id).maybeSingle();if(!membership)return json({error:'Business access unavailable.'},403);
 if(action==='BEGIN'){
  const provider=String(body.provider??'') as Provider;if(!providerSet.has(provider))return json({error:'Unsupported provider.'},400);const cfg=config(provider);if(!cfg.clientId||!cfg.clientSecret||!cfg.callback)return json({error:'Provider OAuth credentials are not configured.'},503);
  const state=await signedState({businessId,userId:user.id,provider,nonce:crypto.randomUUID(),exp:Date.now()+10*60*1000},stateSecret);const params=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.callback,response_type:'code',scope:cfg.scopes.join(' '),state});if(provider!=='MICROSOFT_CALENDAR'){params.set('access_type','offline');params.set('prompt','consent');params.set('include_granted_scopes','true')}return json({authorizationUrl:cfg.authorize+'?'+params});
 }
 if(action==='DISCONNECT'){
  const connectionId=String(body.connectionId??'');const {data:connection}=await admin.from('integration_connections').select('id,provider').eq('id',connectionId).eq('business_id',businessId).maybeSingle();if(!connection)return json({error:'Connection not found.'},404);await admin.from('integration_oauth_credentials').delete().eq('connection_id',connectionId).eq('business_id',businessId);await admin.from('integration_connections').update({status:'REVOKED',revoked_at:new Date().toISOString(),secret_reference:null,updated_at:new Date().toISOString()}).eq('id',connectionId).eq('business_id',businessId);await admin.from('audit_logs').insert({actor_id:user.id,action:'INTEGRATION_DISCONNECTED',entity_type:'integration_connection',entity_id:connectionId,metadata:{business_id:businessId,provider:connection.provider}});return json({disconnected:true});
 }
 return json({error:'Unsupported action.'},400);
});
