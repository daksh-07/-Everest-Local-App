import {requireSupabaseConfig,supabase} from './supabase';
export type UniversalKind='TOP'|'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT';
export type UniversalResult={kind:'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT';id:string;title:string;subtitle:string;score:number;metadata:Record<string,unknown>};
export async function universalSearch(query:string,kind:UniversalKind='TOP',limit=24,offset=0,signal?:AbortSignal):Promise<UniversalResult[]>{
 requireSupabaseConfig();
 const request=supabase.rpc('universal_search',{p_query:query.trim(),p_kind:kind,p_limit:limit,p_offset:offset});
 const {data,error}=await (signal?request.abortSignal(signal):request);
 if(error)throw Object.assign(new Error(error.message),{code:error.code});
 return (data??[]) as UniversalResult[];
}
