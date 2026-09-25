import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const enc=new TextEncoder(),dec=new TextDecoder();
const fromB64u=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const b64u=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function key(raw:string,usage:KeyUsage[]){const digest=await crypto.subtle.digest('SHA-256',enc.encode(raw));return crypto.subtle.importKey('raw',digest,'AES-GCM',false,usage)}
async function decrypt(ciphertext:string,iv:string,secret:string){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64u(iv)},await key(secret,['decrypt']),fromB64u(ciphertext));return JSON.parse(dec.decode(plain))}
async function encrypt(tokens:unknown,secret:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret,['encrypt']),enc.encode(JSON.stringify(tokens)));return{ciphertext:b64u(new Uint8Array(cipher)),iv:b64u(iv)}}
function bookingTimes(date:string,time:string|null){const start=new Date(date+'T'+(time||'12:00:00'));if(Number.isNaN(start.getTime()))return null;const end=new Date(start.getTime()+60*60*1000);return{start:start.toISOString(),end:end.toISOString()}}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 const url=Deno.env.get('SUPABASE_URL')??'';
 const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
 const secretKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
 const tokenSecret=Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')??'';
 if(!url||!publishable||!secretKey||!tokenSecret)return json({error:'Calendar sync service is not configured.'},503);
 const authorization=req.headers.get('Authorization')??'';
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const admin=createClient(url,secretKey,{auth:{persistSession:false}});
 const {data:{user}}=await userClient.auth.getUser();
 if(!user)return json({error:'Authentication required.'},401);
 const body=await req.json().catch(()=>({}));
 const connectionId=String(body.connectionId??'');
 const {data:connection}=await admin.from('customer_calendar_connections').select('*').eq('id',connectionId).eq('user_id',user.id).eq('provider','GOOGLE_CALENDAR').maybeSingle();
 if(!connection||connection.status!=='CONNECTED'||!connection.sync_enabled)return json({error:'Active Google Calendar connection not found.'},404);
 const {data:credential}=await admin.from('customer_calendar_oauth_credentials').select('token_ciphertext,token_iv,token_expires_at').eq('connection_id',connectionId).eq('user_id',user.id).maybeSingle();
 if(!credential)return json({error:'Calendar credentials need reconnection.'},409);
 let tokens=await decrypt(credential.token_ciphertext,credential.token_iv,tokenSecret);
 let accessToken=String(tokens.access_token??'');
 if(!accessToken||!credential.token_expires_at||new Date(credential.token_expires_at).getTime()<Date.now()+60_000){
  const clientId=Deno.env.get('GOOGLE_CLIENT_ID')??'',clientSecret=Deno.env.get('GOOGLE_CLIENT_SECRET')??'';
  if(!tokens.refresh_token||!clientId||!clientSecret)return json({error:'Calendar credentials need reconnection.'},409);
  const refresh=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:String(tokens.refresh_token),grant_type:'refresh_token'})});
  if(!refresh.ok){await admin.from('customer_calendar_connections').update({status:'NEEDS_ATTENTION',last_error_code:'TOKEN_REFRESH_FAILED',updated_at:new Date().toISOString()}).eq('id',connectionId);return json({error:'Calendar authorization expired. Reconnect it.'},409)}
  const next=await refresh.json();tokens={...tokens,...next,refresh_token:tokens.refresh_token};accessToken=String(next.access_token);
  const encrypted=await encrypt(tokens,tokenSecret);
  await admin.from('customer_calendar_oauth_credentials').update({token_ciphertext:encrypted.ciphertext,token_iv:encrypted.iv,token_expires_at:new Date(Date.now()+Number(next.expires_in??3600)*1000).toISOString(),updated_at:new Date().toISOString()}).eq('connection_id',connectionId);
 }
 const headers={Authorization:'Bearer '+accessToken,'Content-Type':'application/json'};
 const calendarId=encodeURIComponent(connection.provider_calendar_id||'primary');
 let importedBusyBlocks=0,exportedBookings=0;
 if(connection.import_busy_time){
  const timeMin=new Date(Date.now()-7*86400000).toISOString(),timeMax=new Date(Date.now()+180*86400000).toISOString();
  const endpoint=`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?singleEvents=true&showDeleted=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=2500&fields=items(id,status,transparency,start,end,updated,extendedProperties)`;
  const response=await fetch(endpoint,{headers});if(!response.ok)return json({error:'Google Calendar import failed.'},502);
  const payload=await response.json();
  for(const event of payload.items??[]){
   if(event.extendedProperties?.private?.everest_customer_booking_id)continue;
   const start=event.start?.dateTime??(event.start?.date?event.start.date+'T00:00:00Z':null);
   const end=event.end?.dateTime??(event.end?.date?event.end.date+'T00:00:00Z':null);
   if(!event.id||!start||!end)continue;
   const status=event.status==='cancelled'||event.transparency==='transparent'?'CANCELLED':'BUSY';
   await admin.from('customer_calendar_busy_blocks').upsert({user_id:user.id,connection_id:connectionId,external_event_id:event.id,starts_at:start,ends_at:end,status,privacy:'OPAQUE',safe_label:'Busy',provider_updated_at:event.updated??null,synced_at:new Date().toISOString()},{onConflict:'user_id,connection_id,external_event_id'});
   importedBusyBlocks++;
  }
 }
 if(connection.export_marketplace_bookings){
  const cutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const {data:bookings,error:bookingError}=await admin.from('bookings').select('id,business_id,status,scheduled_date,scheduled_time,created_at').eq('customer_id',user.id).gte('scheduled_date',cutoff).not('scheduled_date','is',null).order('scheduled_date');
  if(bookingError)return json({error:'Everest bookings could not be loaded.'},500);
  for(const booking of bookings??[]){
   const times=bookingTimes(booking.scheduled_date,booking.scheduled_time);if(!times)continue;
   const {data:link}=await admin.from('customer_calendar_event_links').select('id,external_event_id,last_synced_at').eq('user_id',user.id).eq('connection_id',connectionId).eq('marketplace_booking_id',booking.id).maybeSingle();
   if(booking.status==='CANCELLED'){
    if(link){await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(link.external_event_id)}`,{method:'DELETE',headers});await admin.from('customer_calendar_event_links').delete().eq('id',link.id)}
    continue;
   }
   if(!['CONFIRMED','UPCOMING','IN_PROGRESS'].includes(String(booking.status)))continue;
   const event={summary:'Everest booking',description:'Managed by Everest Local',start:{dateTime:times.start},end:{dateTime:times.end},extendedProperties:{private:{everest_customer_booking_id:booking.id}}};
   let externalId=link?.external_event_id;
   if(link){
    const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(externalId)}`,{method:'PATCH',headers,body:JSON.stringify(event)});if(!response.ok)continue;
   }else{
    const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,{method:'POST',headers,body:JSON.stringify(event)});if(!response.ok)continue;externalId=(await response.json()).id;
   }
   await admin.from('customer_calendar_event_links').upsert({user_id:user.id,connection_id:connectionId,external_event_id:externalId,marketplace_booking_id:booking.id,last_synced_at:new Date().toISOString()},{onConflict:'user_id,connection_id,marketplace_booking_id'});
   exportedBookings++;
  }
 }
 await admin.from('customer_calendar_connections').update({last_synced_at:new Date().toISOString(),last_error_code:null,updated_at:new Date().toISOString()}).eq('id',connectionId).eq('user_id',user.id);
 return json({synced:true,importedBusyBlocks,exportedBookings});
});
