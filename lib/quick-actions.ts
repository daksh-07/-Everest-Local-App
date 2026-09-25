import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as QuickActions from 'expo-quick-actions';

export const PENDING_QUICK_ACTION_KEY='everest-pending-quick-action-route';

export const EVEREST_QUICK_ACTIONS=[
 {id:'request-quote',title:'Request Quote',icon:'symbol:doc.text',params:{href:'/request'}},
 {id:'messages',title:'Messages',icon:'symbol:message',params:{href:'/messages'}},
 {id:'search',title:'Search',icon:'symbol:magnifyingglass',params:{href:'/search'}},
 {id:'ask-everest',title:'Ask Everest',icon:'symbol:sparkles',params:{href:'/assistant'}},
] as const;

export async function configureEverestQuickActions(){
 if(Platform.OS==='web')return false;
 try{
  if(!await QuickActions.isSupported())return false;
  await QuickActions.setItems(EVEREST_QUICK_ACTIONS);
  return true;
 }catch{return false}
}

export function quickActionHref(action:QuickActions.Action|null|undefined){
 const href=action?.params?.href;
 return typeof href==='string'&&href.startsWith('/')?href:null;
}

export async function storePendingQuickActionRoute(href:string){
 if(Platform.OS==='web')return;
 await SecureStore.setItemAsync(PENDING_QUICK_ACTION_KEY,href);
}

export async function consumePendingQuickActionRoute(){
 if(Platform.OS==='web')return null;
 try{
  const value=await SecureStore.getItemAsync(PENDING_QUICK_ACTION_KEY);
  if(value)await SecureStore.deleteItemAsync(PENDING_QUICK_ACTION_KEY);
  return value?.startsWith('/')?value:null;
 }catch{return null}
}

export {QuickActions};
