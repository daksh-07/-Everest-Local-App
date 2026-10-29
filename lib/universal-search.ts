import {searchCountryBusinesses} from './business-discovery';
import {requireSupabaseConfig,supabase} from './supabase';
export type UniversalKind='TOP'|'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT';
export type UniversalResult={kind:'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT';id:string;title:string;subtitle:string;score:number;metadata:Record<string,unknown>};
export async function universalSearch(query:string,kind:UniversalKind='TOP',limit=24,offset=0,signal?:AbortSignal,country?:string):Promise<UniversalResult[]>{
 requireSupabaseConfig();
 if(kind==='BUSINESS'&&country?.trim()){
  const rows=await searchCountryBusinesses(country,query,limit,offset,signal);
  return rows.map(row=>({kind:'BUSINESS',id:row.id,title:row.name,subtitle:[row.suburb,row.city,row.state,row.country].filter(Boolean).join(', '),score:60,metadata:{logo_url:row.logo_url,suburb:row.suburb,country:row.country,verified:row.verification_status==='VERIFIED',accepts_requests:row.accepts_requests}}));
 }

 const request=supabase.rpc('universal_search',{p_query:query.trim(),p_kind:kind,p_limit:limit,p_offset:offset});
 const {data,error}=await (signal?request.abortSignal(signal):request);
 if(error)throw Object.assign(new Error(error.message),{code:error.code});
 return (data??[]) as UniversalResult[];
}
