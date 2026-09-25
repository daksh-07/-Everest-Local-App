import {supabase} from './supabase';

export type CrmLeadStatus='NEW_LEAD'|'CONTACTED'|'QUALIFIED'|'QUOTE_SENT'|'FOLLOW_UP'|'WON'|'LOST';
export type CrmContact={
 id:string;business_id:string;linked_everest_user_id:string|null;display_name:string;phone:string|null;email:string|null;company:string|null;
 source:string;source_detail:string|null;suburb:string|null;city:string|null;state:string|null;country:string|null;notes:string|null;tags:string[];
 lifecycle_stage:string;lead_status:CrmLeadStatus;estimated_value:number|null;last_contact_at:string|null;next_follow_up_at:string|null;created_at:string;updated_at:string;
};
export type CrmActivity={id:string;kind:string;title:string;detail:string|null;occurred_at:string;source_record_type:string|null;source_record_id:string|null};
export type CrmTask={id:string;task:string;due_at:string;priority:'LOW'|'NORMAL'|'HIGH';status:'OPEN'|'DONE'|'CANCELLED'};
export type BusinessAvailability={business_id:string;status:'AVAILABLE_NOW'|'AVAILABLE_LATER'|'BUSY'|'OFFLINE';available_from:string|null;available_until:string|null;updated_at:string};

export async function listBusinessContacts(businessId:string){
 const {data,error}=await supabase.from('business_contacts').select('*').eq('business_id',businessId).order('updated_at',{ascending:false});
 if(error)throw new Error(error.message);
 return (data??[]) as CrmContact[];
}
export async function createBusinessContact(input:{businessId:string;name:string;phone?:string;email?:string;source?:string;sourceDetail?:string;estimatedValue?:number|null;notes?:string}){
 const {data,error}=await supabase.rpc('create_business_contact',{
  p_business_id:input.businessId,p_display_name:input.name,p_phone:input.phone||null,p_email:input.email||null,p_source:input.source||'MANUAL',
  p_source_detail:input.sourceDetail||null,p_estimated_value:input.estimatedValue??null,p_notes:input.notes||null
 });
 if(error)throw new Error(error.message);return String(data);
}
export async function findPossibleDuplicates(businessId:string,email?:string,phone?:string){
 if(!email?.trim()&&!phone?.trim())return[];
 const {data,error}=await supabase.rpc('find_business_contact_duplicates',{p_business_id:businessId,p_email:email||null,p_phone:phone||null});
 if(error)throw new Error(error.message);return data??[];
}
export async function updateLeadStatus(businessId:string,contactId:string,status:CrmLeadStatus){
 const {error}=await supabase.from('business_contacts').update({lead_status:status,last_contact_at:new Date().toISOString()}).eq('business_id',businessId).eq('id',contactId);
 if(error)throw new Error(error.message);
 const {data:{user}}=await supabase.auth.getUser();
 if(user)await supabase.from('crm_activities').insert({business_id:businessId,contact_id:contactId,kind:'LEAD_STAGE_CHANGED',title:'Lead moved to '+status.replaceAll('_',' '),created_by:user.id});
}
export async function addCrmNote(businessId:string,contactId:string,body:string){
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in required.');
 const {error}=await supabase.from('crm_notes').insert({business_id:businessId,contact_id:contactId,body:body.trim(),created_by:user.id});if(error)throw new Error(error.message);
 await supabase.from('crm_activities').insert({business_id:businessId,contact_id:contactId,kind:'NOTE_ADDED',title:'Note added',detail:body.trim().slice(0,240),created_by:user.id});
}
export async function addCrmTask(businessId:string,contactId:string,task:string,dueAt:string,priority:'LOW'|'NORMAL'|'HIGH'='NORMAL'){
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in required.');
 const {error}=await supabase.from('crm_tasks').insert({business_id:businessId,contact_id:contactId,task:task.trim(),due_at:dueAt,priority,owner_id:user.id,created_by:user.id});if(error)throw new Error(error.message);
 await supabase.from('business_contacts').update({next_follow_up_at:dueAt}).eq('business_id',businessId).eq('id',contactId);
}
export async function setBusinessAvailability(businessId:string,status:BusinessAvailability['status'],availableFrom?:string|null,availableUntil?:string|null){
 const {error}=await supabase.rpc('set_business_availability',{p_business_id:businessId,p_status:status,p_available_from:availableFrom??null,p_available_until:availableUntil??null});
 if(error)throw new Error(error.message);
}
