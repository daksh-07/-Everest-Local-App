import {supabase} from './supabase';
export type DiscoveryBusiness={id:string;name:string;logo_url:string|null;verification_status:string;suburb:string|null;city:string|null;state:string|null;country:string;accepts_requests:boolean};
export type DiscoveryPlace={suburb:string;city:string;state:string;country:string};
export function literalLike(value:string){return value.replace(/[\\%_]/g,match=>'\\'+match)}
function query(country:string){if(country.length>150||/[\\%_*]/.test(country))throw new Error('Choose a valid country.');let q=supabase.from('businesses').select('id,name,logo_url,verification_status,suburb,city,state,country,accepts_requests').eq('status','ACTIVE').eq('verification_status','VERIFIED');if(country.trim())q=q.ilike('country',literalLike(country.trim()));return q;}
export async function discoverBusinesses(place:DiscoveryPlace|null,limit=8){
 const country=place?.country.trim()||'';const found=new Map<string,DiscoveryBusiness>();
 if(country&&place)for(const [field,value] of [['suburb',place.suburb],['city',place.city],['state',place.state]] as const){
  if(!value.trim())continue;
  const {data,error}=await query(country).ilike(field,literalLike(value.trim())).order('name').order('id').limit(limit);if(error)throw error;
  for(const item of data??[])found.set(item.id,item as DiscoveryBusiness);if(found.size>=limit)break;
 }
 if(found.size)return {rows:[...found.values()].slice(0,limit),scope:'LOCAL' as const};
 const {data,error}=await query(country).order('name').order('id').limit(limit);if(error)throw error;
 return {rows:(data??[]) as DiscoveryBusiness[],scope:country?'COUNTRY' as const:'GLOBAL' as const};
}
export async function searchCountryBusinesses(country:string,text:string,limit=30,offset=0,signal?:AbortSignal){
 let q=query(country).order('name').order('id');if(text.trim())q=q.ilike('name','%'+literalLike(text.trim())+'%');
 const bounded=Math.min(50,Math.max(1,limit));const start=Math.max(0,offset);
 const request=q.range(start,start+bounded-1);const {data,error}=await (signal?request.abortSignal(signal):request);if(error)throw error;
 return (data??[]) as DiscoveryBusiness[];
}

/** Availability and country predicates execute on the server before the candidate limit. */
export async function discoverAvailableBusinesses(place:DiscoveryPlace,limit=40){
 const country=place.country.trim();if(!country||country.length>150||/[\\%_*]/.test(country))return [] as DiscoveryBusiness[];
 let request=supabase.from('business_availability')
  .select('businesses!inner(id,name,logo_url,verification_status,suburb,city,state,country,accepts_requests),available_until')
  .eq('status','AVAILABLE_NOW').eq('businesses.status','ACTIVE').eq('businesses.verification_status','VERIFIED').eq('businesses.accepts_requests',true)
  .ilike('businesses.country',literalLike(country)).or('available_until.is.null,available_until.gt.'+new Date().toISOString())
  .order('business_id');
 const [field,value]=place.city.trim()?['city',place.city]:place.suburb.trim()?['suburb',place.suburb]:['state',place.state];
 if(value.trim())request=request.ilike('businesses.'+field,literalLike(value.trim()));
 const {data,error}=await request.limit(Math.min(50,Math.max(1,limit)));
 if(error)throw error;
 return (data??[]).flatMap(row=>{const b=Array.isArray(row.businesses)?row.businesses[0]:row.businesses;return b?[b as DiscoveryBusiness]:[]});
}
