import {supabase} from './supabase';

export const CRM_SOURCES=['EVEREST','GOOGLE','FACEBOOK','INSTAGRAM','WEBSITE','REFERRAL','PHONE','WALK_IN','EMAIL','MANUAL','IMPORT','OTHER'] as const;
export type CrmSource=typeof CRM_SOURCES[number];
export type CrmLifecycleStage='LEAD'|'CUSTOMER'|'PAST_CUSTOMER'|'ARCHIVED';
export type CrmOpportunityStatus='OPEN'|'WON'|'LOST';
export type CrmTaskType='CALL'|'EMAIL'|'MESSAGE'|'FOLLOW_UP'|'APPOINTMENT'|'GENERAL';
export type CrmTaskPriority='LOW'|'NORMAL'|'HIGH';
export type CrmTaskStatus='OPEN'|'DONE'|'CANCELLED';
export type CrmQuoteStatus='DRAFT'|'SENT'|'VIEWED'|'ACCEPTED'|'DECLINED'|'EXPIRED'|'CANCELLED';
export type CrmBookingStatus='TENTATIVE'|'CONFIRMED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'|'NO_SHOW';

// Kept only while P0 data migrates. Sales state must live on crm_opportunities.
export type CrmLeadStatus='NEW_LEAD'|'CONTACTED'|'QUALIFIED'|'QUOTE_SENT'|'FOLLOW_UP'|'WON'|'LOST';

export type CrmContact={
 id:string;business_id:string;linked_everest_user_id:string|null;display_name:string;first_name:string|null;last_name:string|null;
 phone:string|null;email:string|null;company:string|null;source:CrmSource|string;source_detail:string|null;
 suburb:string|null;city:string|null;state:string|null;country:string|null;notes:string|null;tags:string[];
 lifecycle_stage:CrmLifecycleStage|string;last_contact_at:string|null;next_follow_up_at:string|null;last_activity_at:string|null;
 archived_at:string|null;merged_into_id:string|null;created_at:string;updated_at:string;
 lead_status?:CrmLeadStatus;estimated_value?:number|null;
};

export type CrmPipeline={id:string;business_id:string;name:string;is_default:boolean;is_archived:boolean;created_at:string;updated_at:string};
export type CrmPipelineStage={
 id:string;business_id:string;pipeline_id:string;stage_key:string;label:string;position:number;stage_type:'OPEN'|'WON'|'LOST';
 probability:number|null;color_token:string|null;created_at:string;updated_at:string;
};
export type CrmOpportunity={
 id:string;business_id:string;contact_id:string;title:string;service_id:string|null;service_label:string|null;source:CrmSource|string;source_detail:string|null;
 pipeline_id:string;stage_id:string;status:CrmOpportunityStatus;estimated_value:number|null;currency:string;probability:number|null;expected_close_date:string|null;
 won_at:string|null;lost_at:string|null;lost_reason:string|null;linked_service_request_id:string|null;linked_marketplace_opportunity_id:string|null;
 linked_marketplace_quote_id:string|null;linked_marketplace_booking_id:string|null;linked_crm_quote_id:string|null;linked_crm_booking_id:string|null;
 owner_id:string|null;created_by:string|null;last_activity_at:string;created_at:string;updated_at:string;
 contact?:CrmContact;stage?:CrmPipelineStage;next_task?:CrmTask|null;
};
export type CrmActivity={id:string;business_id?:string;contact_id?:string;opportunity_id?:string|null;kind:string;title:string;detail:string|null;channel?:string|null;metadata?:Record<string,unknown>;occurred_at:string;source_record_type:string|null;source_record_id:string|null};
export type CrmTask={
 id:string;business_id?:string;contact_id:string|null;opportunity_id:string|null;task:string;task_type:CrmTaskType;due_at:string;
 priority:CrmTaskPriority;status:CrmTaskStatus;owner_id:string|null;notes:string|null;completed_at:string|null;created_at?:string;updated_at?:string;
};
export type CrmQuote={
 id:string;business_id:string;contact_id:string;opportunity_id:string|null;quote_number:number;title:string|null;status:CrmQuoteStatus;currency:string;
 discount_amount:number;tax_amount:number;subtotal:number;total:number;deposit_amount:number;notes:string|null;terms:string|null;expires_at:string|null;
 sent_at:string|null;viewed_at:string|null;accepted_at:string|null;declined_at:string|null;created_at:string;updated_at:string;
};
export type CrmQuoteItem={id:string;quote_id:string;description:string;quantity:number;unit_price:number;discount_amount:number;position:number};
export type CrmBooking={
 id:string;business_id:string;contact_id:string;opportunity_id:string|null;quote_id:string|null;service_id:string|null;service_label:string;
 scheduled_start:string;scheduled_end:string;location_label:string|null;price:number|null;currency:string;status:CrmBookingStatus;notes:string|null;
 assigned_user_id:string|null;completed_at:string|null;cancelled_at:string|null;created_at:string;updated_at:string;
};
export type BusinessAvailability={business_id:string;status:'AVAILABLE_NOW'|'AVAILABLE_LATER'|'BUSY'|'OFFLINE';available_from:string|null;available_until:string|null;updated_at:string};

function clean(value?:string|null){const v=value?.trim();return v?v:null;}
export function crmLabel(value:string){return value.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());}
export function contactLocation(contact:Pick<CrmContact,'suburb'|'city'|'state'|'country'>){return [contact.suburb,contact.city,contact.state,contact.country].filter(Boolean).join(', ');}
export function isOverdue(dueAt:string){return new Date(dueAt).getTime()<Date.now();}

export async function listBusinessContacts(businessId:string,options?:{includeArchived?:boolean}){
 let query=supabase.from('business_contacts').select('*').eq('business_id',businessId).order('updated_at',{ascending:false});
 if(!options?.includeArchived)query=query.is('archived_at',null);
 const {data,error}=await query;if(error)throw new Error(error.message);
 return (data??[]) as CrmContact[];
}

export async function getBusinessContact(businessId:string,contactId:string){
 const {data,error}=await supabase.from('business_contacts').select('*').eq('business_id',businessId).eq('id',contactId).maybeSingle();
 if(error)throw new Error(error.message);return (data??null) as CrmContact|null;
}

export async function createBusinessContact(input:{
 businessId:string;name:string;phone?:string;email?:string;company?:string;source?:CrmSource|string;sourceDetail?:string;
 suburb?:string;city?:string;state?:string;country?:string;notes?:string;
}){
 const source=(input.source||'MANUAL') as CrmSource;
 const {data,error}=await supabase.rpc('crm_create_contact',{
  p_business_id:input.businessId,p_display_name:input.name,p_phone:clean(input.phone),p_email:clean(input.email),p_company:clean(input.company),
  p_source:source,p_source_detail:clean(input.sourceDetail),p_suburb:clean(input.suburb),p_city:clean(input.city),p_state:clean(input.state),
  p_country:clean(input.country),p_notes:clean(input.notes),
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function findPossibleDuplicates(businessId:string,email?:string,phone?:string){
 if(!email?.trim()&&!phone?.trim())return[];
 const {data,error}=await supabase.rpc('find_business_contact_duplicates',{p_business_id:businessId,p_email:email||null,p_phone:phone||null});
 if(error)throw new Error(error.message);return (data??[]) as Array<{id:string;display_name:string;email:string|null;phone:string|null;reason:string}>;
}

export type CrmImportRow={name:string;phone?:string;email?:string;company?:string;suburb?:string;city?:string;state?:string;country?:string;notes?:string};
export type CrmImportResult={imported:number;duplicates:number;skipped:number};

export async function importCrmContacts(businessId:string,rows:CrmImportRow[],sourceDetail:string){
 const safe=rows.slice(0,1000).map(row=>({name:row.name.trim(),phone:clean(row.phone),email:clean(row.email),company:clean(row.company),suburb:clean(row.suburb),city:clean(row.city),state:clean(row.state),country:clean(row.country),notes:clean(row.notes)})).filter(row=>row.name);
 if(!safe.length)throw new Error('Choose at least one contact with a name.');
 const {data,error}=await supabase.rpc('crm_import_contacts',{p_business_id:businessId,p_rows:safe,p_source_detail:sourceDetail});
 if(error)throw new Error(error.message);return data as CrmImportResult;
}

export async function archiveCrmContact(businessId:string,contactId:string){
 const {data,error}=await supabase.rpc('crm_archive_contact',{p_business_id:businessId,p_contact_id:contactId});
 if(error)throw new Error(error.message);return data===true;
}

export async function mergeCrmContacts(businessId:string,primaryContactId:string,secondaryContactId:string){
 const {data,error}=await supabase.rpc('crm_merge_contacts',{p_business_id:businessId,p_primary_contact_id:primaryContactId,p_secondary_contact_id:secondaryContactId});
 if(error)throw new Error(error.message);return data===true;
}

export async function listCrmPipelines(businessId:string){
 const {data,error}=await supabase.from('crm_pipelines').select('*').eq('business_id',businessId).eq('is_archived',false).order('is_default',{ascending:false}).order('created_at');
 if(error)throw new Error(error.message);return (data??[]) as CrmPipeline[];
}

export async function ensureDefaultCrmPipeline(businessId:string){
 const {data,error}=await supabase.rpc('crm_ensure_default_pipeline',{p_business_id:businessId});
 if(error)throw new Error(error.message);return String(data);
}

export async function listCrmPipelineStages(businessId:string,pipelineId?:string){
 let query=supabase.from('crm_pipeline_stages').select('*').eq('business_id',businessId).order('position');
 if(pipelineId)query=query.eq('pipeline_id',pipelineId);
 const {data,error}=await query;if(error)throw new Error(error.message);return (data??[]) as CrmPipelineStage[];
}

export async function createCrmOpportunity(input:{
 businessId:string;contactId:string;title:string;source?:CrmSource|string;serviceLabel?:string;estimatedValue?:number|null;
 expectedCloseDate?:string|null;sourceDetail?:string;
}){
 const {data,error}=await supabase.rpc('crm_create_opportunity',{
  p_business_id:input.businessId,p_contact_id:input.contactId,p_title:input.title,p_source:input.source||'MANUAL',
  p_service_label:clean(input.serviceLabel),p_estimated_value:input.estimatedValue??null,p_expected_close_date:input.expectedCloseDate??null,
  p_source_detail:clean(input.sourceDetail),
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function listCrmOpportunities(businessId:string,options?:{contactId?:string;status?:CrmOpportunityStatus;pipelineId?:string}){
 let query=supabase.from('crm_opportunities').select('*').eq('business_id',businessId).order('updated_at',{ascending:false});
 if(options?.contactId)query=query.eq('contact_id',options.contactId);
 if(options?.status)query=query.eq('status',options.status);
 if(options?.pipelineId)query=query.eq('pipeline_id',options.pipelineId);
 const {data,error}=await query;if(error)throw new Error(error.message);
 const opportunities=(data??[]) as CrmOpportunity[];
 if(!opportunities.length)return opportunities;
 const contactIds=[...new Set(opportunities.map(o=>o.contact_id))];
 const stageIds=[...new Set(opportunities.map(o=>o.stage_id))];
 const [contactsR,stagesR,tasksR]=await Promise.all([
  supabase.from('business_contacts').select('*').eq('business_id',businessId).in('id',contactIds),
  supabase.from('crm_pipeline_stages').select('*').eq('business_id',businessId).in('id',stageIds),
  supabase.from('crm_tasks').select('id,business_id,contact_id,opportunity_id,task,task_type,due_at,priority,status,owner_id,notes,completed_at,created_at,updated_at').eq('business_id',businessId).eq('status','OPEN').in('opportunity_id',opportunities.map(o=>o.id)).order('due_at'),
 ]);
 for(const r of [contactsR,stagesR,tasksR])if(r.error)throw new Error(r.error.message);
 const contacts=new Map(((contactsR.data??[]) as CrmContact[]).map(c=>[c.id,c]));
 const stages=new Map(((stagesR.data??[]) as CrmPipelineStage[]).map(s=>[s.id,s]));
 const nextTask=new Map<string,CrmTask>();
 for(const task of (tasksR.data??[]) as CrmTask[]){if(task.opportunity_id&&!nextTask.has(task.opportunity_id))nextTask.set(task.opportunity_id,task);}
 return opportunities.map(o=>({...o,contact:contacts.get(o.contact_id),stage:stages.get(o.stage_id),next_task:nextTask.get(o.id)??null}));
}

export async function getCrmOpportunity(businessId:string,opportunityId:string){
 const rows=await listCrmOpportunities(businessId);return rows.find(o=>o.id===opportunityId)??null;
}

export async function moveCrmOpportunityStage(businessId:string,opportunityId:string,stageId:string,lostReason?:string|null){
 const {data,error}=await supabase.rpc('crm_move_opportunity',{p_business_id:businessId,p_opportunity_id:opportunityId,p_stage_id:stageId,p_lost_reason:clean(lostReason)});
 if(error)throw new Error(error.message);return data===true;
}

// Compatibility shim for old callers. New screens must move a deal, not a contact.
export async function updateLeadStatus(businessId:string,contactId:string,status:CrmLeadStatus){
 const opportunities=await listCrmOpportunities(businessId,{contactId});
 const deal=opportunities.find(o=>o.status==='OPEN')??opportunities[0];if(!deal)throw new Error('Create a deal before moving its stage.');
 const stages=await listCrmPipelineStages(businessId,deal.pipeline_id);
 const stage=stages.find(s=>s.stage_key===status);if(!stage)throw new Error('Pipeline stage not available.');
 await moveCrmOpportunityStage(businessId,deal.id,stage.id);
}

export async function addCrmNote(businessId:string,contactId:string,body:string,opportunityId?:string|null){
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in required.');
 const text=body.trim();if(!text)throw new Error('Note cannot be empty.');
 const {error}=await supabase.from('crm_notes').insert({business_id:businessId,contact_id:contactId,body:text,created_by:user.id});if(error)throw new Error(error.message);
 const {error:activityError}=await supabase.from('crm_activities').insert({business_id:businessId,contact_id:contactId,opportunity_id:opportunityId??null,kind:'NOTE_ADDED',title:'Note added',detail:text.slice(0,240),created_by:user.id});
 if(activityError)throw new Error(activityError.message);
 await supabase.from('business_contacts').update({last_activity_at:new Date().toISOString()}).eq('business_id',businessId).eq('id',contactId);
}

export async function createCrmTask(input:{
 businessId:string;contactId?:string|null;opportunityId?:string|null;title:string;type:CrmTaskType;dueAt:string;priority?:CrmTaskPriority;notes?:string;
}){
 const {data,error}=await supabase.rpc('crm_create_task',{
  p_business_id:input.businessId,p_contact_id:input.contactId??null,p_opportunity_id:input.opportunityId??null,p_title:input.title,
  p_type:input.type,p_due_at:input.dueAt,p_priority:input.priority??'NORMAL',p_notes:clean(input.notes),
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function addCrmTask(businessId:string,contactId:string,task:string,dueAt:string,priority:CrmTaskPriority='NORMAL'){
 return createCrmTask({businessId,contactId,title:task,type:'FOLLOW_UP',dueAt,priority});
}

export async function listCrmTasks(businessId:string,options?:{contactId?:string;opportunityId?:string;status?:CrmTaskStatus}){
 let query=supabase.from('crm_tasks').select('id,business_id,contact_id,opportunity_id,task,task_type,due_at,priority,status,owner_id,notes,completed_at,created_at,updated_at').eq('business_id',businessId).order('due_at');
 if(options?.contactId)query=query.eq('contact_id',options.contactId);
 if(options?.opportunityId)query=query.eq('opportunity_id',options.opportunityId);
 if(options?.status)query=query.eq('status',options.status);
 const {data,error}=await query;if(error)throw new Error(error.message);return (data??[]) as CrmTask[];
}

export async function completeCrmTask(businessId:string,taskId:string){
 const {data,error}=await supabase.rpc('crm_complete_task',{p_business_id:businessId,p_task_id:taskId});
 if(error)throw new Error(error.message);return data===true;
}

export async function listCrmActivities(businessId:string,options?:{contactId?:string;opportunityId?:string;limit?:number}){
 let query=supabase.from('crm_activities').select('id,business_id,contact_id,opportunity_id,kind,title,detail,channel,metadata,occurred_at,source_record_type,source_record_id').eq('business_id',businessId).order('occurred_at',{ascending:false}).limit(options?.limit??100);
 if(options?.contactId)query=query.eq('contact_id',options.contactId);
 if(options?.opportunityId)query=query.eq('opportunity_id',options.opportunityId);
 const {data,error}=await query;if(error)throw new Error(error.message);return (data??[]) as CrmActivity[];
}

export async function createCrmQuote(input:{
 businessId:string;contactId:string;opportunityId?:string|null;title?:string;items:Array<{description:string;quantity:number;unit_price:number;discount_amount?:number}>;
 discountAmount?:number;taxAmount?:number;depositAmount?:number;notes?:string;terms?:string;expiresAt?:string|null;
}){
 const {data,error}=await supabase.rpc('crm_create_quote',{
  p_business_id:input.businessId,p_contact_id:input.contactId,p_opportunity_id:input.opportunityId??null,p_title:clean(input.title),p_items:input.items,
  p_discount_amount:input.discountAmount??0,p_tax_amount:input.taxAmount??0,p_deposit_amount:input.depositAmount??0,p_notes:clean(input.notes),
  p_terms:clean(input.terms),p_expires_at:input.expiresAt??null,
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function listCrmQuotes(businessId:string,options?:{contactId?:string;opportunityId?:string}){
 let query=supabase.from('crm_quotes').select('*').eq('business_id',businessId).order('created_at',{ascending:false});
 if(options?.contactId)query=query.eq('contact_id',options.contactId);
 if(options?.opportunityId)query=query.eq('opportunity_id',options.opportunityId);
 const {data,error}=await query;if(error)throw new Error(error.message);return (data??[]) as CrmQuote[];
}

export async function getCrmQuote(businessId:string,quoteId:string){
 const [quoteR,itemsR]=await Promise.all([
  supabase.from('crm_quotes').select('*').eq('business_id',businessId).eq('id',quoteId).maybeSingle(),
  supabase.from('crm_quote_items').select('id,quote_id,description,quantity,unit_price,discount_amount,position').eq('business_id',businessId).eq('quote_id',quoteId).order('position'),
 ]);
 if(quoteR.error)throw new Error(quoteR.error.message);if(itemsR.error)throw new Error(itemsR.error.message);
 return {quote:(quoteR.data??null) as CrmQuote|null,items:(itemsR.data??[]) as CrmQuoteItem[]};
}

export async function setCrmQuoteStatus(businessId:string,quoteId:string,status:CrmQuoteStatus){
 const {data,error}=await supabase.rpc('crm_set_quote_status',{p_business_id:businessId,p_quote_id:quoteId,p_status:status});
 if(error)throw new Error(error.message);return data===true;
}

export async function createCrmBooking(input:{
 businessId:string;contactId:string;opportunityId?:string|null;quoteId?:string|null;serviceLabel:string;scheduledStart:string;durationMinutes:number;
 locationLabel?:string;price?:number|null;status?:'TENTATIVE'|'CONFIRMED';notes?:string;
}){
 const {data,error}=await supabase.rpc('crm_create_booking',{
  p_business_id:input.businessId,p_contact_id:input.contactId,p_opportunity_id:input.opportunityId??null,p_quote_id:input.quoteId??null,
  p_service_label:input.serviceLabel,p_scheduled_start:input.scheduledStart,p_duration_minutes:input.durationMinutes,p_location_label:clean(input.locationLabel),
  p_price:input.price??null,p_status:input.status??'CONFIRMED',p_notes:clean(input.notes),
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function listCrmBookings(businessId:string,options?:{contactId?:string;opportunityId?:string;from?:string;to?:string}){
 let query=supabase.from('crm_bookings').select('*').eq('business_id',businessId).order('scheduled_start');
 if(options?.contactId)query=query.eq('contact_id',options.contactId);
 if(options?.opportunityId)query=query.eq('opportunity_id',options.opportunityId);
 if(options?.from)query=query.gte('scheduled_start',options.from);
 if(options?.to)query=query.lt('scheduled_start',options.to);
 const {data,error}=await query;if(error)throw new Error(error.message);return (data??[]) as CrmBooking[];
}

export async function setCrmBookingStatus(businessId:string,bookingId:string,status:CrmBookingStatus){
 const {data,error}=await supabase.rpc('crm_set_booking_status',{p_business_id:businessId,p_booking_id:bookingId,p_status:status});
 if(error)throw new Error(error.message);return data===true;
}

export async function convertCrmQuoteToBooking(businessId:string,quoteId:string,scheduledStart:string,durationMinutes=60,locationLabel?:string){
 const {data,error}=await supabase.rpc('crm_convert_quote_to_booking',{
  p_business_id:businessId,p_quote_id:quoteId,p_scheduled_start:scheduledStart,p_duration_minutes:durationMinutes,p_location_label:clean(locationLabel),
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function logCrmCommunication(input:{businessId:string;contactId:string;opportunityId?:string|null;channel:'CALL'|'SMS'|'EMAIL'|'INSTAGRAM_DM'|'FACEBOOK_MESSAGE'|'OTHER';direction:'INBOUND'|'OUTBOUND';summary?:string}){
 const {data,error}=await supabase.rpc('crm_log_communication',{
  p_business_id:input.businessId,p_contact_id:input.contactId,p_opportunity_id:input.opportunityId??null,p_channel:input.channel,
  p_direction:input.direction,p_summary:clean(input.summary),
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function setBusinessAvailability(businessId:string,status:BusinessAvailability['status'],availableFrom?:string|null,availableUntil?:string|null){
 const {error}=await supabase.rpc('set_business_availability',{p_business_id:businessId,p_status:status,p_available_from:availableFrom??null,p_available_until:availableUntil??null});
 if(error)throw new Error(error.message);
}


export type CrmCalendarBlock={id:string;business_id:string;title:string;starts_at:string;ends_at:string;created_at:string;updated_at:string};

export async function listCrmCalendarBlocks(businessId:string,options?:{from?:string;to?:string}){
 let query=supabase.from('crm_calendar_blocks').select('*').eq('business_id',businessId).order('starts_at');
 if(options?.from)query=query.gte('starts_at',options.from);
 if(options?.to)query=query.lt('starts_at',options.to);
 const {data,error}=await query;if(error)throw new Error(error.message);return (data??[]) as CrmCalendarBlock[];
}
export async function createCrmCalendarBlock(businessId:string,title:string,startsAt:string,endsAt:string){
 const {data,error}=await supabase.rpc('crm_create_calendar_block',{p_business_id:businessId,p_title:title,p_starts_at:startsAt,p_ends_at:endsAt});
 if(error)throw new Error(error.message);return String(data);
}
export async function deleteCrmCalendarBlock(businessId:string,id:string){
 const {error}=await supabase.from('crm_calendar_blocks').delete().eq('business_id',businessId).eq('id',id);if(error)throw new Error(error.message);
}


export async function rescheduleCrmBooking(businessId:string,bookingId:string,scheduledStart:string,durationMinutes:number){
 const {data,error}=await supabase.rpc('crm_reschedule_booking',{p_business_id:businessId,p_booking_id:bookingId,p_scheduled_start:scheduledStart,p_duration_minutes:durationMinutes});
 if(error)throw new Error(error.message);return data===true;
}
