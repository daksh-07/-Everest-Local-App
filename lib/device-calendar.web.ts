export type DeviceBusyWindow={externalEventId:string;startsAt:string;endsAt:string;updatedAt:string|null};
export type DeviceCalendarAccess={calendarId:string;label:string;busy:DeviceBusyWindow[]};
const unavailable=()=>{throw new Error('Apple/device calendar access is available in the Everest mobile app. Use Google Calendar on web.');};
export async function readDeviceCalendarBusyWindows():Promise<DeviceCalendarAccess>{return unavailable();}
export async function createDeviceBookingEvent(input:{calendarId:string;bookingId:string;start:string;end:string}):Promise<string>{void input;return unavailable();}
export async function updateDeviceBookingEvent(externalEventId:string,input:{start:string;end:string}):Promise<void>{void externalEventId;void input;return unavailable();}
export async function deleteDeviceBookingEvent(externalEventId:string):Promise<void>{void externalEventId;return unavailable();}
