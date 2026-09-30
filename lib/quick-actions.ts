import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as QuickActions from 'expo-quick-actions';

export const PENDING_QUICK_ACTION_KEY='everest-pending-quick-action-route';

export const EVEREST_QUICK_ACTIONS:QuickActions.Action[]=[
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

function hasAsciiControlCharacter(value:string){
 for(let index=0;index<value.length;index++){
  const code=value.charCodeAt(index);
  if(code<=31||code===127)return true;
 }
 return false;
}

export function isSafeInternalRoute(value:unknown):value is string{
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return false;
 if(hasAsciiControlCharacter(value))return false;
 return !/^[\\/]*[a-z][a-z0-9+.-]*:/i.test(value);
}

export function quickActionHref(action:QuickActions.Action|null|undefined){
 const href=action?.params?.href;
 return isSafeInternalRoute(href)?href:null;
}

export async function storePendingQuickActionRoute(href:string){
 if(Platform.OS==='web'||!isSafeInternalRoute(href))return;
 await SecureStore.setItemAsync(PENDING_QUICK_ACTION_KEY,href);
}

export async function clearPendingQuickActionRoute(){
 if(Platform.OS==='web')return;
 try{await SecureStore.deleteItemAsync(PENDING_QUICK_ACTION_KEY)}catch{return}
}

export async function consumePendingQuickActionRoute(){
 if(Platform.OS==='web')return null;
 try{
  const value=await SecureStore.getItemAsync(PENDING_QUICK_ACTION_KEY);
  if(value)await SecureStore.deleteItemAsync(PENDING_QUICK_ACTION_KEY);
  return isSafeInternalRoute(value)?value:null;
 }catch{return null}
}

export {QuickActions};
