import {requireSupabaseConfig,supabase} from './supabase';
export type UniversalKind='TOP'|'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT';
export type UniversalResult={kind:'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT';id:string;title:string;subtitle:string;score:number;metadata:Record<string,unknown>};
export async function universalSearch(query:string,kind:UniversalKind='TOP',limit=24,offset=0):Promise<UniversalResult[]>{requireSupabaseConfig();const {data,error}=await supabase.rpc('universal_search',{p_query:query.trim(),p_kind:kind,p_limit:limit,p_offset:offset});if(error)throw new Error(error.message);return (data??[]) as UniversalResult[]}
