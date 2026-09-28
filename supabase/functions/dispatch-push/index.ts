import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

type PushInput={notificationId?:unknown};
type PushTicket={status?:'ok'|'error';id?:string;message?:string;details?:{error?:string}};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,
 headers:{'Content-Type':'application/json'},
});

function stringValue(value:unknown,max=300){
 return typeof value==='string'?value.slice(0,max):'';
}

Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 const url=Deno.env.get('SUPABASE_URL');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!service)return json({error:'Push service is not configured'},503);

 const presented=req.headers.get('X-Everest-Push-Secret')??'';
 if(!presented)return json({error:'Unauthorized'},401);

 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:valid,error:secretError}=await admin.rpc('verify_push_dispatch_secret',{p_secret:presented});
 if(secretError||valid!==true)return json({error:'Unauthorized'},401);

 const input=await req.json().catch(()=>null) as PushInput|null;
 const notificationId=typeof input?.notificationId==='string'?input.notificationId.trim():'';
 if(!notificationId)return json({error:'Notification id is required'},400);

 const {data:notification,error:notificationError}=await admin.from('notifications')
  .select('id,user_id,kind,title,body,data,created_at')
  .eq('id',notificationId)
  .maybeSingle();
 if(notificationError)return json({error:'Notification could not be loaded'},500);
 if(!notification)return json({error:'Notification not found'},404);

 const allowedKinds=new Set(['EVEREST_LIVE_REQUEST','SERVICE_DISPATCH_OFFER','NEW_OPPORTUNITY','BOOKING_CONFIRMED']);
 if(!allowedKinds.has(notification.kind))return json({ignored:true,reason:'NOT_PUSH_KIND'});

 const ageMs=Date.now()-new Date(notification.created_at).getTime();
 if(!Number.isFinite(ageMs)||ageMs>30*60*1000)return json({ignored:true,reason:'STALE_NOTIFICATION'});

 const {data:tokens,error:tokenError}=await admin.from('device_push_tokens')
  .select('id,expo_push_token,platform')
  .eq('user_id',notification.user_id)
  .eq('enabled',true)
  .order('last_seen_at',{ascending:false});
 if(tokenError)return json({error:'Push devices could not be loaded'},500);
 if(!tokens?.length)return json({sent:0});

 const {data:attempts}=await admin.from('push_delivery_attempts')
  .select('push_token_id')
  .eq('notification_id',notification.id);
 const already=new Set((attempts??[]).map((row:{push_token_id:string})=>row.push_token_id));
 const pending=tokens.filter((token:{id:string})=>!already.has(token.id));
 if(!pending.length)return json({sent:0,duplicate:true});

 const urgent=notification.kind==='EVEREST_LIVE_REQUEST'||notification.kind==='SERVICE_DISPATCH_OFFER';
 const sourceData=(notification.data&&typeof notification.data==='object'?notification.data:{}) as Record<string,unknown>;
 const payloadData={
  ...sourceData,
  notificationId:notification.id,
  kind:notification.kind,
  urgency:urgent?'URGENT':'NORMAL',
 };
 const messages=pending.map((token:{expo_push_token:string})=>({
  to:token.expo_push_token,
  title:stringValue(notification.title,120)||'Everest Local',
  body:stringValue(notification.body,500)||'You have a new update.',
  data:payloadData,
  sound:urgent?'default':undefined,
  priority:urgent?'high':'default',
  channelId:urgent?'everest-live':'everest-updates',
  badge:1,
  ttl:urgent?300:1800,
 }));

 const headers:Record<string,string>={'Content-Type':'application/json','Accept':'application/json'};
 const expoAccessToken=Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
 if(expoAccessToken)headers.Authorization='Bearer '+expoAccessToken;

 let response:Response;
 try{
  response=await fetch('https://exp.host/--/api/v2/push/send',{
   method:'POST',
   headers,
   body:JSON.stringify(messages),
  });
 }catch(error){
  console.log('expo_push_network_error',{notificationId,error:String(error)});
  return json({error:'Push provider unavailable'},502);
 }

 const parsed=await response.json().catch(()=>({})) as {data?:PushTicket[];errors?:unknown[]};
 if(!response.ok||!Array.isArray(parsed.data)){
  console.log('expo_push_provider_error',{notificationId,status:response.status,errors:parsed.errors??null});
  return json({error:'Push provider rejected the request'},502);
 }

 let sent=0;
 for(let i=0;i<pending.length;i++){
  const token=pending[i] as {id:string;expo_push_token:string};
  const ticket=parsed.data[i]??{};
  const deviceNotRegistered=ticket.status==='error'&&ticket.details?.error==='DeviceNotRegistered';
  const status=deviceNotRegistered?'DEVICE_NOT_REGISTERED':ticket.status==='ok'?'SENT_TO_EXPO':'FAILED';
  await admin.from('push_delivery_attempts').upsert({
   notification_id:notification.id,
   push_token_id:token.id,
   status,
   expo_ticket_id:ticket.id??null,
   error_code:ticket.status==='error'?(ticket.details?.error??'EXPO_PUSH_ERROR'):null,
   attempted_at:new Date().toISOString(),
  },{onConflict:'notification_id,push_token_id'});
  if(deviceNotRegistered){
   await admin.from('device_push_tokens').update({enabled:false,updated_at:new Date().toISOString()}).eq('id',token.id);
  }
  if(ticket.status==='ok')sent++;
 }

 await admin.from('audit_logs').insert({
  actor_id:null,
  action:'REMOTE_PUSH_DISPATCHED',
  entity_type:'NOTIFICATION',
  entity_id:notification.id,
  metadata:{kind:notification.kind,device_count:pending.length,sent_count:sent,urgent},
 });
 return json({sent,attempted:pending.length});
});
