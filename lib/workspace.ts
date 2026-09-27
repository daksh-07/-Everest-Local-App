import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase, requireSupabaseConfig } from './supabase';
import {retryRead} from './resilience';

export type AppMode='CUSTOMER'|'BUSINESS';
export type BusinessWorkspace={
  id:string;name:string;logo_url:string|null;status:string;verification_status:string;
  member_role:'OWNER'|'ADMIN'|'OPERATIONS_MANAGER'|'DISPATCHER'|'FINANCE'|'CRM_SALES'|'TEAM_LEADER'|'TECHNICIAN'|'CONTRACTOR'|'READ_ONLY'|'MANAGER'|'STAFF'|string;
  member_status?:string;suburb:string|null;city:string|null;state:string|null;
  can_view_team?:boolean;can_manage_team?:boolean;can_assign_jobs?:boolean;can_view_all_jobs?:boolean;
  can_view_crm?:boolean;can_manage_crm?:boolean;can_view_inbox?:boolean;
  can_view_finance?:boolean;can_manage_finance?:boolean;can_manage_payouts?:boolean;
  can_manage_catalog?:boolean;can_view_orders?:boolean;can_manage_orders?:boolean;can_manage_settings?:boolean;
};
export type WorkspaceContext={mode:AppMode;active_business_id:string|null;businesses:BusinessWorkspace[]};

const MODE_KEY='everest.app_mode';
const BUSINESS_KEY='everest.active_business_id';
const WORKFORCE_ROLES=new Set(['TEAM_LEADER','TECHNICIAN','CONTRACTOR','STAFF']);

async function readLocal(key:string){
  try{
    if(Platform.OS==='web') return typeof window!=='undefined'?window.localStorage.getItem(key):null;
    return await SecureStore.getItemAsync(key);
  }catch{return null}
}
async function writeLocal(key:string,value:string|null){
  try{
    if(Platform.OS==='web'){if(typeof window==='undefined')return;if(value===null)window.localStorage.removeItem(key);else window.localStorage.setItem(key,value);return;}
    if(value===null)await SecureStore.deleteItemAsync(key);else await SecureStore.setItemAsync(key,value);
  }catch{return;}
}

export function isWorkforceWorkspace(business:BusinessWorkspace){
  return WORKFORCE_ROLES.has(String(business.member_role).toUpperCase())&&!business.can_view_all_jobs&&!business.can_view_crm&&!business.can_view_finance;
}
export function businessHomeRoute(business:BusinessWorkspace){
  const role=String(business.member_role).toUpperCase();
  if(role==='FINANCE')return'/business-control' as const;
  if(role==='READ_ONLY')return'/business-operations' as const;
  return isWorkforceWorkspace(business)?'/business-my-work' as const:'/business-today' as const;
}

export async function getWorkspaceContext():Promise<WorkspaceContext>{
  requireSupabaseConfig();
  const {data,error}=await retryRead(()=>supabase.rpc('get_my_workspace_context'));
  if(error)throw new Error(error.message);
  const server=(data??{}) as Partial<WorkspaceContext>;
  const businesses=Array.isArray(server.businesses)?server.businesses as BusinessWorkspace[]:[];
  const localMode=await readLocal(MODE_KEY);
  const localBusiness=await readLocal(BUSINESS_KEY);
  const validLocalBusiness=localBusiness&&businesses.some(b=>b.id===localBusiness)?localBusiness:null;
  const serverMode:AppMode=server.mode==='BUSINESS'?'BUSINESS':'CUSTOMER';
  const desiredMode:AppMode=localMode==='BUSINESS'&&businesses.length?'BUSINESS':localMode==='CUSTOMER'?'CUSTOMER':serverMode;
  const active=desiredMode==='BUSINESS'?(validLocalBusiness??server.active_business_id??businesses[0]?.id??null):null;
  return {mode:desiredMode==='BUSINESS'&&active?'BUSINESS':'CUSTOMER',active_business_id:active,businesses};
}

export async function setWorkspacePreference(mode:AppMode,activeBusinessId:string|null){
  requireSupabaseConfig();
  const {data,error}=await supabase.rpc('set_my_workspace_preference',{p_mode:mode,p_active_business_id:mode==='BUSINESS'?activeBusinessId:null});
  if(error||data!==true)throw new Error(error?.message||'Workspace preference could not be saved.');
  await Promise.all([writeLocal(MODE_KEY,mode),writeLocal(BUSINESS_KEY,mode==='BUSINESS'?activeBusinessId:null)]);
}

export async function getBusinessWorkspace(businessId:string){
  const ctx=await getWorkspaceContext();
  const business=ctx.businesses.find(item=>item.id===businessId);
  if(!business)throw new Error('You do not have access to this business.');
  return business;
}
