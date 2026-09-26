import {supabase,requireSupabaseConfig} from './supabase';
import {userFacingError} from './errors';

export type LiveArrivalWindow='ASAP'|'WITHIN_30_MINUTES'|'WITHIN_1_HOUR'|'TODAY';
export type LiveStatus='SEARCHING'|'NOTIFYING'|'RESPONSES_AVAILABLE'|'PROVIDER_SELECTED'|'NO_PROVIDER_FOUND'|'EXPIRED'|'CANCELLED'|'BOOKED';
export type EverestLiveState={request_id:string;live_status:LiveStatus;radius_km:number;radius_stage:number;expires_at:string;eligible_count:number;notified_count:number;viewed_count:number;responding_count:number;quote_count:number};
export type LiveQuote={id:string;request_id:string;business_id:string;description:string;total:number;deposit:number;proposed_date:string|null;proposed_time:string|null;status:string;created_at:string;businesses:{id:string;name:string;logo_url:string|null;verification_status:string}|null};

function fail(error:{message:string},fallback:string){throw new Error(userFacingError(new Error(error.message),fallback));}
export async function startEverestLive(requestId:string,window:LiveArrivalWindow){requireSupabaseConfig();const {data,error}=await supabase.rpc('start_everest_live',{p_request_id:requestId,p_arrival_window:window});if(error)fail(error,'Everest Live could not start. Your request is still saved.');return data as string;}
export async function getEverestLiveState(requestId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('get_everest_live_state',{p_request_id:requestId});if(error)fail(error,'Live search status could not be refreshed.');return ((data??[])[0]??null) as EverestLiveState|null;}
export async function expandEverestLive(requestId:string){const {data,error}=await supabase.rpc('expand_everest_live',{p_request_id:requestId});if(error)fail(error,'The search area could not be expanded.');return Number(data??0);}
export async function cancelEverestLive(requestId:string){const {data,error}=await supabase.rpc('cancel_everest_live',{p_request_id:requestId});if(error)fail(error,'The live search could not be cancelled.');return Boolean(data);}
export async function listLiveQuotes(requestId:string){const {data,error}=await supabase.from('quotes').select('id,request_id,business_id,description,total,deposit,proposed_date,proposed_time,status,created_at,businesses(id,name,logo_url,verification_status)').eq('request_id',requestId).in('status',['SENT','VIEWED','ACCEPTED']).order('created_at',{ascending:false});if(error)fail(error,'Provider responses could not be loaded.');return (data??[]).map(row=>({...row,businesses:Array.isArray(row.businesses)?row.businesses[0]??null:row.businesses})) as unknown as LiveQuote[];}
