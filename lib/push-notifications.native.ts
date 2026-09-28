import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {supabase} from './supabase';

Notifications.setNotificationHandler({
 handleNotification:async notification=>{
  const urgency=String(notification.request.content.data?.urgency??'NORMAL');
  return {
   shouldShowBanner:true,
   shouldShowList:true,
   shouldPlaySound:urgency==='URGENT',
   shouldSetBadge:true,
  };
 },
});

function routeFromData(data:Record<string,unknown>|undefined){
 if(!data)return null;
 const raw=typeof data.route==='string'&&data.route.startsWith('/')?data.route:null;
 const requestId=typeof data.request_id==='string'?data.request_id:null;
 if(raw==='/opportunities'&&requestId)return '/opportunities?requestId='+encodeURIComponent(requestId);
 if(raw)return raw;
 if(typeof data.offer_id==='string')return '/business-today';
 if(typeof data.booking_id==='string')return '/business-bookings';
 return null;
}

export async function registerBusinessPushNotifications(){
 if(Platform.OS!=='ios'&&Platform.OS!=='android')return false;
 try{
  if(Platform.OS==='android'){
   await Notifications.setNotificationChannelAsync('everest-live',{
    name:'Everest Live',
    description:'Urgent nearby service requests and live work offers.',
    importance:Notifications.AndroidImportance.HIGH,
    vibrationPattern:[0,220,110,220],
    sound:'default',
    lockscreenVisibility:Notifications.AndroidNotificationVisibility.PRIVATE,
   });
   await Notifications.setNotificationChannelAsync('everest-updates',{
    name:'Everest updates',
    description:'Bookings and business updates.',
    importance:Notifications.AndroidImportance.DEFAULT,
    sound:'default',
    lockscreenVisibility:Notifications.AndroidNotificationVisibility.PRIVATE,
   });
  }

  let permission=await Notifications.getPermissionsAsync();
  if(permission.status==='undetermined')permission=await Notifications.requestPermissionsAsync({
   ios:{allowAlert:true,allowBadge:true,allowSound:true},
  });
  if(permission.status!=='granted')return false;

  const projectId=Constants.easConfig?.projectId
    ??(Constants.expoConfig?.extra?.eas as {projectId?:string}|undefined)?.projectId;
  const expoToken=(await Notifications.getExpoPushTokenAsync(projectId?{projectId}:undefined)).data;
  if(!expoToken)return false;

  const {error}=await supabase.rpc('register_my_push_token',{
   p_expo_push_token:expoToken,
   p_platform:Platform.OS.toUpperCase(),
   p_device_name:null,
   p_app_version:Constants.expoConfig?.version??null,
  });
  if(error)throw error;

  return true;
 }catch(error){
  if(typeof console!=='undefined')console.warn('[Everest push registration]',error);
  return false;
 }
}

export function subscribeToPushResponses(handler:(href:string)=>void){
 return Notifications.addNotificationResponseReceivedListener(response=>{
  const href=routeFromData(response.notification.request.content.data as Record<string,unknown>|undefined);
  if(href)handler(href);
 });
}

export async function getInitialPushHref(){
 try{
  const response=await Notifications.getLastNotificationResponseAsync();
  return routeFromData(response?.notification.request.content.data as Record<string,unknown>|undefined);
 }catch{return null}
}

export async function clearPushBadge(){
 try{await Notifications.setBadgeCountAsync(0)}catch{return}
}
