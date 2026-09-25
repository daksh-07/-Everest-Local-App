import * as Calendar from 'expo-calendar';
import {Platform} from 'react-native';

export type DeviceBusyWindow={externalEventId:string;startsAt:string;endsAt:string;updatedAt:string|null};
export type DeviceCalendarAccess={calendarId:string;label:string;busy:DeviceBusyWindow[]};

export async function readDeviceCalendarBusyWindows():Promise<DeviceCalendarAccess>{
 const available=await Calendar.isAvailableAsync();
 if(!available)throw new Error('Device calendar is unavailable on this device.');
 const permission=await Calendar.requestCalendarPermissionsAsync();
 if(!permission.granted)throw new Error('Calendar permission was not granted.');
 const calendars=await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
 const readable=calendars.filter(calendar=>Platform.OS!=='android'||calendar.isVisible!==false);
 if(!readable.length)throw new Error('No readable calendar is available on this device.');
 const writable=readable.find(calendar=>calendar.isPrimary&&calendar.allowsModifications)
  ??readable.find(calendar=>calendar.allowsModifications)
  ??readable[0];
 const start=new Date(Date.now()-7*86400000);
 const end=new Date(Date.now()+180*86400000);
 const events=await Calendar.getEventsAsync(readable.map(calendar=>calendar.id),start,end);
 const busy=events.flatMap(event=>{
  if(event.availability===Calendar.Availability.FREE)return[];
  const startsAt=new Date(event.startDate).toISOString();
  const endsAt=new Date(event.endDate).toISOString();
  if(!startsAt||!endsAt||new Date(endsAt).getTime()<=new Date(startsAt).getTime())return[];
  return[{externalEventId:`${event.calendarId}::${event.id}`,startsAt,endsAt,updatedAt:event.lastModifiedDate?new Date(event.lastModifiedDate).toISOString():null}];
 });
 return{calendarId:writable.id,label:writable.title||'Device calendar',busy};
}

function rawEventId(composite:string){const split=composite.indexOf('::');return split>=0?composite.slice(split+2):composite}

export async function createDeviceBookingEvent(input:{calendarId:string;bookingId:string;start:string;end:string}){
 const id=await Calendar.createEventAsync(input.calendarId,{
  title:'Everest booking',
  notes:`Managed by Everest Local · ${input.bookingId}`,
  startDate:new Date(input.start),
  endDate:new Date(input.end),
 });
 return`${input.calendarId}::${id}`;
}

export async function updateDeviceBookingEvent(externalEventId:string,input:{start:string;end:string}){
 await Calendar.updateEventAsync(rawEventId(externalEventId),{title:'Everest booking',startDate:new Date(input.start),endDate:new Date(input.end)});
}

export async function deleteDeviceBookingEvent(externalEventId:string){
 try{await Calendar.deleteEventAsync(rawEventId(externalEventId));}catch{/* Event may already have been removed by the user. */}
}
