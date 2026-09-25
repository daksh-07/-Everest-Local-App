import { userFacingError } from './errors';
import { requireSupabaseConfig, supabase } from './supabase';

export type JobArrivalStatus='NOT_STARTED'|'ON_MY_WAY'|'ARRIVED'|'IN_PROGRESS'|'COMPLETED';
export type JobRecord={booking_id:string;business_id:string;customer_id:string;arrival_status:JobArrivalStatus;arrival_eta:string|null;completion_summary:string|null;started_at:string|null;completed_at:string|null;updated_at:string};
export type JobChecklistItem={id:string;booking_id:string;business_id:string;label:string;is_complete:boolean;position:number;completed_at:string|null};

export async function getJobWorkspace(bookingId:string){
 requireSupabaseConfig();
 const [recordResult,checklistResult]=await Promise.all([
  supabase.from('booking_job_records').select('booking_id,business_id,customer_id,arrival_status,arrival_eta,completion_summary,started_at,completed_at,updated_at').eq('booking_id',bookingId).maybeSingle(),
  supabase.from('booking_job_checklist_items').select('id,booking_id,business_id,label,is_complete,position,completed_at').eq('booking_id',bookingId).order('position'),
 ]);
 if(recordResult.error)throw new Error(userFacingError(recordResult.error,'Job progress could not be loaded.'));
 if(checklistResult.error)throw new Error(userFacingError(checklistResult.error,'Job checklist could not be loaded.'));
 return {record:(recordResult.data??null) as JobRecord|null,checklist:(checklistResult.data??[]) as JobChecklistItem[]};
}

export async function ensureJobWorkspace(bookingId:string){
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('ensure_booking_job_record',{p_booking_id:bookingId});
 if(error)throw new Error(userFacingError(error,'Job workspace could not be prepared.'));
 return data as JobRecord;
}

export async function setJobProgress(bookingId:string,status:JobArrivalStatus,completionSummary?:string){
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('set_booking_job_progress',{p_booking_id:bookingId,p_arrival_status:status,p_arrival_eta:null,p_completion_summary:completionSummary?.trim()||null});
 if(error)throw new Error(userFacingError(error,'Job progress could not be updated.'));
 return data as JobRecord;
}

export async function addChecklistItem(bookingId:string,label:string){
 requireSupabaseConfig();
 const clean=label.trim();if(!clean)throw new Error('Add a checklist item first.');
 const {data,error}=await supabase.rpc('add_booking_job_checklist_item',{p_booking_id:bookingId,p_label:clean});
 if(error)throw new Error(userFacingError(error,'Checklist item could not be added.'));
 return data as string;
}

export async function setChecklistItem(itemId:string,isComplete:boolean){
 requireSupabaseConfig();
 const {error}=await supabase.rpc('set_booking_job_checklist_item',{p_item_id:itemId,p_is_complete:isComplete});
 if(error)throw new Error(userFacingError(error,'Checklist item could not be updated.'));
}
