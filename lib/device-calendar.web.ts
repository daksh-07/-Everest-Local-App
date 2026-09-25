export type DeviceBusyWindow={externalEventId:string;startsAt:string;endsAt:string;updatedAt:string|null};
export type DeviceCalendarAccess={calendarId:string;label:string;busy:DeviceBusyWindow[]};
const unavailable=()=>{throw new Error('Apple/device calendar access is available in the Everest mobile app. Use Google Calendar on web.');};
export async function readDeviceCalendarBusyWindows():Promise<DeviceCalendarAccess>{return unavailable();}
export async function createDeviceBookingEvent(_input:{calendarId:string;bookingId:string;start:string;end:string}):Promise<string>{return unavailable();}
export async function updateDeviceBookingEvent(_externalEventId:string,_input:{start:string;end:string}):Promise<void>{return unavailable();}
export async function deleteDeviceBookingEvent(_externalEventId:string):Promise<void>{return unavailable();}
