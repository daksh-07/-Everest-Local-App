import {supabase} from './supabase';

export type IntegrationProvider='GOOGLE_CALENDAR'|'MICROSOFT_CALENDAR'|'GMAIL'|'OPENAI';
export type IntegrationStatus='PENDING'|'CONNECTED'|'NEEDS_ATTENTION'|'REVOKED';
export type IntegrationConnection={id:string;business_id:string;provider:IntegrationProvider;account_label:string|null;status:IntegrationStatus;granted_scopes:string[];last_error_code:string|null;connected_at:string|null;updated_at:string};
export type CalendarConnection={id:string;business_id:string;provider:'GOOGLE_CALENDAR'|'MICROSOFT_CALENDAR';calendar_label:string|null;sync_enabled:boolean;import_busy_time:boolean;export_marketplace_bookings:boolean;export_crm_bookings:boolean;export_tasks:boolean;sync_direction:'IMPORT_ONLY'|'EXPORT_ONLY'|'TWO_WAY';last_synced_at:string|null};
export type CrmAutomation={id:string;business_id:string;name:string;status:'DRAFT'|'ACTIVE'|'PAUSED';trigger_type:string;last_run_at:string|null;created_at:string;actions?:Array<{action_type:string;action_config:Record<string,unknown>}>};

export async function listIntegrationConnections(businessId:string){
 const {data,error}=await supabase.from('integration_connections').select('id,business_id,provider,account_label,status,granted_scopes,last_error_code,connected_at,updated_at').eq('business_id',businessId).order('provider');
 if(error)throw new Error(error.message);return(data??[]) as IntegrationConnection[];
}

export async function listCalendarConnections(businessId:string){
 const {data,error}=await supabase.from('calendar_connections').select('id,business_id,provider,calendar_label,sync_enabled,import_busy_time,export_marketplace_bookings,export_crm_bookings,export_tasks,sync_direction,last_synced_at').eq('business_id',businessId);
 if(error)throw new Error(error.message);return(data??[]) as CalendarConnection[];
}

// OAuth is initiated server-side. The Edge Function returns a provider authorization URL
// bound to a short-lived, signed state value; no provider secret or token reaches this module.
export async function beginIntegrationOAuth(businessId:string,provider:Exclude<IntegrationProvider,'OPENAI'>){
 const {data,error}=await supabase.functions.invoke('crm-integration-oauth',{body:{action:'BEGIN',businessId,provider}});
 if(error)throw new Error(error.message);const url=typeof data?.authorizationUrl==='string'?data.authorizationUrl:'';
 if(!url)throw new Error('This integration is not configured yet. Add its server-side OAuth credentials first.');return url;
}

export async function disconnectIntegration(businessId:string,connectionId:string){
 const {data,error}=await supabase.functions.invoke('crm-integration-oauth',{body:{action:'DISCONNECT',businessId,connectionId}});
 if(error)throw new Error(error.message);return data?.disconnected===true;
}

export async function configureCalendarConnection(input:{businessId:string;connectionId:string;importBusy:boolean;exportMarketplace:boolean;exportCrm:boolean;exportTasks:boolean;syncDirection:'IMPORT_ONLY'|'EXPORT_ONLY'|'TWO_WAY'}){
 const {data,error}=await supabase.rpc('crm_configure_calendar_connection',{p_business_id:input.businessId,p_connection_id:input.connectionId,p_import_busy:input.importBusy,p_export_marketplace:input.exportMarketplace,p_export_crm:input.exportCrm,p_export_tasks:input.exportTasks,p_sync_direction:input.syncDirection});
 if(error)throw new Error(error.message);return data===true;
}

export async function syncCalendarConnection(businessId:string,connectionId:string){
 const {data,error}=await supabase.functions.invoke('crm-calendar-sync',{body:{businessId,connectionId}});if(error)throw new Error(error.message);return data as {synced:boolean;importedBusyBlocks:number;exportedCrmBookings:number};
}

export async function listCrmAutomations(businessId:string){
 const {data,error}=await supabase.from('crm_automations').select('id,business_id,name,status,trigger_type,last_run_at,created_at,crm_automation_actions(action_type,action_config)').eq('business_id',businessId).order('created_at',{ascending:false});
 if(error)throw new Error(error.message);return(data??[]).map(row=>({...row,actions:(row.crm_automation_actions??[]) as CrmAutomation['actions']})) as CrmAutomation[];
}

export async function createCrmAutomation(input:{businessId:string;name:string;triggerType:string;actionType:string;actionConfig?:Record<string,unknown>}){
 const {data,error}=await supabase.rpc('crm_create_automation',{p_business_id:input.businessId,p_name:input.name,p_trigger_type:input.triggerType,p_action_type:input.actionType,p_action_config:input.actionConfig??{}});
 if(error)throw new Error(error.message);return String(data);
}

export async function setCrmAutomationStatus(businessId:string,automationId:string,status:'DRAFT'|'ACTIVE'|'PAUSED'){
 const {data,error}=await supabase.rpc('crm_set_automation_status',{p_business_id:businessId,p_automation_id:automationId,p_status:status});
 if(error)throw new Error(error.message);return data===true;
}
