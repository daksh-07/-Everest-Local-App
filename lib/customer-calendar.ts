import {Platform} from 'react-native';
import {supabase} from './supabase';
import {createDeviceBookingEvent,deleteDeviceBookingEvent,readDeviceCalendarBusyWindows,updateDeviceBookingEvent} from './device-calendar';

export type CustomerCalendarProvider='APPLE_DEVICE'|'GOOGLE_CALENDAR';
export type CustomerCalendarConnection={
 id:string;user_id:string;provider:CustomerCalendarProvider;provider_account_id:string;account_label:string|null;status:'PENDING'|'CONNECTED'|'NEEDS_ATTENTION'|'REVOKED';
 provider_calendar_id:string|null;calendar_label:string|null;sync_enabled:boolean;import_busy_time:boolean;export_marketplace_bookings:boolean;allow_ask_everest:boolean;
 last_error_code:string|null;connected_at:string;last_synced_at:string|null;updated_at:string;
};
type BookingRow={id:string;status:string;scheduled_date:string|null;scheduled_time:string|null};

async function currentUserId(){
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)throw new Error('Sign in required.');
 return user.id;
}

export async function listCustomerCalendarConnections(){
 const {data,error}=await supabase.from('customer_calendar_connections')
  .select('id,user_id,provider,provider_account_id,account_label,status,provider_calendar_id,calendar_label,sync_enabled,import_busy_time,export_marketplace_bookings,allow_ask_everest,last_error_code,connected_at,last_synced_at,updated_at')
  .neq('status','REVOKED').order('provider');
 if(error)throw new Error(error.message);
 return(data??[]) as CustomerCalendarConnection[];
}

export async function beginCustomerGoogleCalendarOAuth(){
 const {data,error}=await supabase.functions.invoke('customer-calendar-oauth',{body:{action:'BEGIN'}});
 if(error)throw new Error(error.message);
 const url=typeof data?.authorizationUrl==='string'?data.authorizationUrl:'';
 if(!url)throw new Error('Google Calendar is not configured yet.');
 return url;
}

export async function disconnectCustomerGoogleCalendar(connectionId:string){
 const {data,error}=await supabase.functions.invoke('customer-calendar-oauth',{body:{action:'DISCONNECT',connectionId}});
 if(error)throw new Error(error.message);
 return data?.disconnected===true;
}

export async function configureCustomerCalendar(connectionId:string,patch:Partial<Pick<CustomerCalendarConnection,'import_busy_time'|'export_marketplace_bookings'|'allow_ask_everest'|'sync_enabled'>>){
 const userId=await currentUserId();
 const {error}=await supabase.from('customer_calendar_connections').update({...patch,updated_at:new Date().toISOString()}).eq('id',connectionId).eq('user_id',userId);
 if(error)throw new Error(error.message);
 if(patch.import_busy_time===false){
  const {error:cleanupError}=await supabase.from('customer_calendar_busy_blocks').delete().eq('connection_id',connectionId).eq('user_id',userId);
  if(cleanupError)throw new Error(cleanupError.message);
 }
}

export async function connectDeviceCalendar(){
 if(Platform.OS==='web')throw new Error('Apple/device calendar access is available in the Everest mobile app.');
 const userId=await currentUserId();
 const access=await readDeviceCalendarBusyWindows();
 const {data,error}=await supabase.from('customer_calendar_connections').upsert({
  user_id:userId,provider:'APPLE_DEVICE',provider_account_id:'device',account_label:Platform.OS==='ios'?'Apple Calendar':'Device Calendar',
  status:'CONNECTED',provider_calendar_id:access.calendarId,calendar_label:access.label,sync_enabled:true,import_busy_time:true,
  export_marketplace_bookings:true,allow_ask_everest:true,last_error_code:null,revoked_at:null,connected_at:new Date().toISOString(),updated_at:new Date().toISOString()
 },{onConflict:'user_id,provider,provider_account_id'}).select('id,user_id,provider,provider_account_id,account_label,status,provider_calendar_id,calendar_label,sync_enabled,import_busy_time,export_marketplace_bookings,allow_ask_everest,last_error_code,connected_at,last_synced_at,updated_at').single();
 if(error)throw new Error(error.message);
 await syncDeviceCalendar(data as CustomerCalendarConnection,access);
 return data as CustomerCalendarConnection;
}

function bookingRange(row:BookingRow){
 if(!row.scheduled_date)return null;
 const start=new Date(`${row.scheduled_date}T${row.scheduled_time||'12:00'}`);
 if(Number.isNaN(start.getTime()))return null;
 return{start:start.toISOString(),end:new Date(start.getTime()+60*60*1000).toISOString()};
}

export async function syncCustomerGoogleCalendar(connectionId:string){
 const {data,error}=await supabase.functions.invoke('customer-calendar-sync',{body:{connectionId}});
 if(error)throw new Error(error.message);
 return data as {synced:boolean;importedBusyBlocks:number;exportedBookings:number};
}

export async function syncDeviceCalendar(connection:CustomerCalendarConnection,preloaded?:Awaited<ReturnType<typeof readDeviceCalendarBusyWindows>>){
 if(connection.provider!=='APPLE_DEVICE')throw new Error('This is not a device calendar connection.');
 const userId=await currentUserId();
 const access=preloaded??await readDeviceCalendarBusyWindows();
 if(connection.import_busy_time){
  const {error:deleteError}=await supabase.from('customer_calendar_busy_blocks').delete().eq('user_id',userId).eq('connection_id',connection.id);
  if(deleteError)throw new Error(deleteError.message);
  if(access.busy.length){
   const {error:busyError}=await supabase.from('customer_calendar_busy_blocks').insert(access.busy.map(item=>({
    user_id:userId,connection_id:connection.id,external_event_id:item.externalEventId,starts_at:item.startsAt,ends_at:item.endsAt,status:'BUSY',
    privacy:'OPAQUE',safe_label:'Busy',provider_updated_at:item.updatedAt,synced_at:new Date().toISOString()
   })));
   if(busyError)throw new Error(busyError.message);
  }
 }
 let exportedBookings=0;
 if(connection.export_marketplace_bookings){
  const cutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const {data:bookings,error:bookingError}=await supabase.from('bookings').select('id,status,scheduled_date,scheduled_time').eq('customer_id',userId).gte('scheduled_date',cutoff).not('scheduled_date','is',null).order('scheduled_date');
  if(bookingError)throw new Error(bookingError.message);
  const {data:links,error:linkError}=await supabase.from('customer_calendar_event_links').select('id,external_event_id,marketplace_booking_id').eq('user_id',userId).eq('connection_id',connection.id);
  if(linkError)throw new Error(linkError.message);
  const byBooking=new Map((links??[]).map(link=>[link.marketplace_booking_id,link]));
  for(const booking of (bookings??[]) as BookingRow[]){
   const link=byBooking.get(booking.id);
   if(booking.status==='CANCELLED'){
    if(link){await deleteDeviceBookingEvent(link.external_event_id);const {error}=await supabase.from('customer_calendar_event_links').delete().eq('id',link.id);if(error)throw new Error(error.message);}
    continue;
   }
   if(!['CONFIRMED','UPCOMING','IN_PROGRESS'].includes(booking.status))continue;
   const range=bookingRange(booking);if(!range)continue;
   if(link){
    await updateDeviceBookingEvent(link.external_event_id,range);
    const {error}=await supabase.from('customer_calendar_event_links').update({last_synced_at:new Date().toISOString()}).eq('id',link.id);
    if(error)throw new Error(error.message);
   }else{
    const externalEventId=await createDeviceBookingEvent({calendarId:access.calendarId,bookingId:booking.id,...range});
    const {error}=await supabase.from('customer_calendar_event_links').insert({user_id:userId,connection_id:connection.id,external_event_id:externalEventId,marketplace_booking_id:booking.id,last_synced_at:new Date().toISOString()});
    if(error)throw new Error(error.message);
   }
   exportedBookings++;
  }
 }
 const now=new Date().toISOString();
 const {error:updateError}=await supabase.from('customer_calendar_connections').update({provider_calendar_id:access.calendarId,calendar_label:access.label,last_synced_at:now,last_error_code:null,updated_at:now}).eq('id',connection.id).eq('user_id',userId);
 if(updateError)throw new Error(updateError.message);
 return{synced:true,importedBusyBlocks:connection.import_busy_time?access.busy.length:0,exportedBookings};
}

export async function syncCustomerCalendar(connection:CustomerCalendarConnection){
 return connection.provider==='GOOGLE_CALENDAR'?syncCustomerGoogleCalendar(connection.id):syncDeviceCalendar(connection);
}

export async function disconnectDeviceCalendar(connectionId:string){
 const userId=await currentUserId();
 const {error}=await supabase.from('customer_calendar_connections').update({status:'REVOKED',sync_enabled:false,revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',connectionId).eq('user_id',userId).eq('provider','APPLE_DEVICE');
 if(error)throw new Error(error.message);
}

export async function refreshCustomerCalendarsForAssistant(){
 const connections=await listCustomerCalendarConnections();
 const freshAfter=Date.now()-5*60*1000;
 const eligible=connections.filter(connection=>connection.status==='CONNECTED'&&connection.sync_enabled&&connection.allow_ask_everest&&(connection.provider!=='APPLE_DEVICE'||Platform.OS!=='web')&&(!connection.last_synced_at||new Date(connection.last_synced_at).getTime()<freshAfter));
 await Promise.allSettled(eligible.map(connection=>syncCustomerCalendar(connection)));
}
