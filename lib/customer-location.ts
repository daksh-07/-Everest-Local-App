import {Platform} from 'react-native';
import * as Location from 'expo-location';
import {supabase} from './supabase';
import {withTimeout} from './resilience';

export type CustomerLocality={
 suburb:string;
 city:string;
 state:string;
 country:string;
 latitude:number;
 longitude:number;
 accuracy:number|null;
};

export type CustomerServiceLocation=CustomerLocality&{
 addressLine1:string;
 postalCode:string;
 formattedAddress:string;
};

const GEO_TIMEOUT_MS=9000;
const WEB_CACHE_MS=10*60_000;
const webCache=new Map<string,{expires:number;value:unknown}>();
function clean(value:string|null|undefined){return (value??'').trim();}
async function fetchJsonCached<T>(url:string):Promise<T|null>{
 const cached=webCache.get(url);
 if(cached&&cached.expires>Date.now())return cached.value as T;
 const controller=typeof AbortController!=='undefined'?new AbortController():null;
 const timer=controller?setTimeout(()=>controller.abort(),GEO_TIMEOUT_MS):null;
 try{
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller?.signal});
  if(!response.ok)return null;
  const value=await response.json() as T;
  webCache.set(url,{expires:Date.now()+WEB_CACHE_MS,value});
  if(webCache.size>40){const first=webCache.keys().next().value as string|undefined;if(first)webCache.delete(first)}
  return value;
 }catch{return null}finally{if(timer)clearTimeout(timer)}
}
async function currentPosition(precise:boolean){
 if(precise){
  try{return await withTimeout(Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}),GEO_TIMEOUT_MS,'Location request')}catch{/* fallback below */}
  try{const last=await Location.getLastKnownPositionAsync({maxAge:60_000,requiredAccuracy:120});if(last)return last}catch{/* fallback below */}
 }
 return withTimeout(Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),GEO_TIMEOUT_MS,'Location request');
}
function unique(parts:string[]){return parts.filter((value,index,all)=>Boolean(value)&&all.indexOf(value)===index)}
function formatAddress(input:{addressLine1:string;suburb:string;city:string;state:string;postalCode:string;country:string}){
 return unique([
  clean(input.addressLine1),
  clean(input.suburb),
  clean(input.city)&&clean(input.city)!==clean(input.suburb)?clean(input.city):'',
  [clean(input.state),clean(input.postalCode)].filter(Boolean).join(' '),
  clean(input.country)
 ]).join(', ');
}

type WebAddress=Record<string,string|undefined>;
function webAddressParts(a:WebAddress){
 const suburb=clean(a.suburb||a.neighbourhood||a.quarter||a.city_district||a.town||a.village);
 const city=clean(a.city||a.town||a.municipality||a.county||suburb);
 const state=clean(a.state||a.state_district||a.region||city);
 const country=clean(a.country);
 const street=clean(a.road||a.pedestrian||a.residential||a.path||a.footway);
 const house=clean(a.house_number);
 const addressLine1=[house,street].filter(Boolean).join(' ').trim();
 const postalCode=clean(a.postcode);
 return{suburb:suburb||city,city:city||suburb,state,country,addressLine1,postalCode};
}

async function reverseGeocodeWeb(latitude:number,longitude:number,zoom=18){
 try{
  const params=new URLSearchParams({format:'jsonv2',lat:String(latitude),lon:String(longitude),zoom:String(zoom),addressdetails:'1'});
  const payload=await fetchJsonCached<{display_name?:string;address?:WebAddress}>(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
  if(!payload)return null;
  const parts=webAddressParts(payload.address??{});
  if(!parts.suburb&&!parts.city)return null;
  return{...parts,formattedAddress:clean(payload.display_name)||formatAddress(parts)};
 }catch{return null;}
}

function nativeAddressParts(place:Location.LocationGeocodedAddress){
 const anyPlace=place as Location.LocationGeocodedAddress&{formattedAddress?:string|null};
 const street=clean(place.street||place.name);
 const streetNumber=clean(place.streetNumber);
 const addressLine1=[streetNumber,street].filter(Boolean).join(' ').trim();
 const suburb=clean(place.district||place.subregion||place.city);
 const city=clean(place.city||place.subregion||suburb);
 const state=clean(place.region||city);
 const country=clean(place.country);
 const postalCode=clean(place.postalCode);
 return{
  addressLine1,
  suburb:suburb||city,
  city:city||suburb,
  state,
  country,
  postalCode,
  formattedAddress:clean(anyPlace.formattedAddress)||formatAddress({addressLine1,suburb:suburb||city,city:city||suburb,state,postalCode,country})
 };
}

async function reversePrecise(latitude:number,longitude:number){
 try{
  const places=await withTimeout(Location.reverseGeocodeAsync({latitude,longitude}),GEO_TIMEOUT_MS,'Reverse geocoding');
  if(places[0]){
   const parts=nativeAddressParts(places[0]);
   if(parts.suburb||parts.city)return parts;
  }
 }catch{/* Web fallback below. */}
 if(Platform.OS==='web')return reverseGeocodeWeb(latitude,longitude,18);
 return null;
}

export async function resolveCustomerLocality(options:{requestIfUndetermined?:boolean}={}):Promise<CustomerLocality|null>{
 const existing=await Location.getForegroundPermissionsAsync();
 let status=existing.status;
 if(status==='undetermined'&&options.requestIfUndetermined!==false){
  status=(await Location.requestForegroundPermissionsAsync()).status;
 }
 if(status!=='granted')return null;

 const current=await currentPosition(false);
 const named=await reversePrecise(current.coords.latitude,current.coords.longitude);
 if(!named)return null;
 return{
  suburb:named.suburb,city:named.city,state:named.state,country:named.country,
  latitude:current.coords.latitude,longitude:current.coords.longitude,accuracy:current.coords.accuracy??null
 };
}

export async function resolveCustomerServiceLocation():Promise<CustomerServiceLocation|null>{
 const existing=await Location.getForegroundPermissionsAsync();
 const status=existing.status==='undetermined'?(await Location.requestForegroundPermissionsAsync()).status:existing.status;
 if(status!=='granted')return null;
 const current=await currentPosition(true);
 const named=await reversePrecise(current.coords.latitude,current.coords.longitude);
 if(!named)return null;
 return{
  ...named,
  latitude:current.coords.latitude,
  longitude:current.coords.longitude,
  accuracy:current.coords.accuracy??null,
  formattedAddress:named.formattedAddress||formatAddress(named)
 };
}

async function geocodeWeb(query:string,country:string,postalCode?:string){
 try{
  const params=new URLSearchParams({format:'jsonv2',q:query,limit:'1',addressdetails:'1'});
  const countryCode=country.trim().toLowerCase()==='australia'?'au':country.trim().toLowerCase()==='india'?'in':null;
  if(countryCode)params.set('countrycodes',countryCode);
  const rows=await fetchJsonCached<Array<{lat:string;lon:string;display_name?:string;address?:WebAddress}>>(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if(!rows)return null;
  const row=rows[0];if(!row)return null;
  const latitude=Number(row.lat),longitude=Number(row.lon);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
  const parts=webAddressParts(row.address??{});
  if(postalCode&&parts.postalCode&&postalCode.trim().toLowerCase()!==parts.postalCode.toLowerCase())return null;
  return{...parts,latitude,longitude,accuracy:null,formattedAddress:clean(row.display_name)||formatAddress(parts)} satisfies CustomerServiceLocation;
 }catch{return null;}
}

export async function geocodeCustomerLocality(input:{suburb?:string|null;city?:string|null;state?:string|null;country?:string|null}):Promise<CustomerLocality|null>{
 const suburb=clean(input.suburb),city=clean(input.city),state=clean(input.state),country=clean(input.country)||'Australia';
 const query=unique([suburb,city&&city!==suburb?city:'',state,country]).join(', ');
 if(!query||(!suburb&&!city))return null;

 if(Platform.OS==='web'){
  const row=await geocodeWeb(query,country);
  if(!row)return null;
  return{
   suburb:row.suburb||suburb||city,
   city:row.city||city||suburb,
   state:row.state||state,
   country:row.country||country,
   latitude:row.latitude,
   longitude:row.longitude,
   accuracy:null,
  };
 }

 try{
  const rows=await withTimeout(Location.geocodeAsync(query),GEO_TIMEOUT_MS,'Locality lookup');
  const first=rows[0];if(!first)return null;
  return{
   suburb:suburb||city,
   city:city||suburb,
   state,
   country,
   latitude:first.latitude,
   longitude:first.longitude,
   accuracy:null,
  };
 }catch{return null;}
}

export async function geocodeServiceAddress(input:{addressLine1:string;suburb:string;city:string;state:string;postalCode?:string;country?:string}):Promise<CustomerServiceLocation|null>{
 const addressLine1=clean(input.addressLine1),suburb=clean(input.suburb),city=clean(input.city),state=clean(input.state),postalCode=clean(input.postalCode),country=clean(input.country)||'Australia';
 const query=formatAddress({addressLine1,suburb,city,state,postalCode,country});
 if(!addressLine1||!suburb||!state)return null;
 if(Platform.OS==='web')return geocodeWeb(query,country,postalCode);
 try{
  const rows=await withTimeout(Location.geocodeAsync(query),GEO_TIMEOUT_MS,'Address lookup');
  const first=rows[0];if(!first)return null;
  const normalized=await reversePrecise(first.latitude,first.longitude);
  return{
   addressLine1:normalized?.addressLine1||addressLine1,
   suburb:normalized?.suburb||suburb,
   city:normalized?.city||city||suburb,
   state:normalized?.state||state,
   country:normalized?.country||country,
   postalCode:normalized?.postalCode||postalCode,
   latitude:first.latitude,
   longitude:first.longitude,
   accuracy:null,
   formattedAddress:normalized?.formattedAddress||query
  };
 }catch{return null;}
}

export async function saveLocalityToProfile(locality:CustomerLocality){
 const {error}=await supabase.rpc('save_my_locality',{
  p_suburb:locality.suburb||null,
  p_city:locality.city||null,
  p_state:locality.state||null,
  p_country:locality.country||null,
 });
 if(error)throw new Error(error.message);
}

export function localityLabel(locality:Pick<CustomerLocality,'suburb'|'city'|'state'|'country'>){
 return [locality.suburb,locality.city&&locality.city!==locality.suburb?locality.city:'',locality.state,locality.country].filter(Boolean).join(', ');
}

export function serviceAddressLabel(location:Pick<CustomerServiceLocation,'addressLine1'|'suburb'|'city'|'state'|'postalCode'|'country'|'formattedAddress'>){
 return clean(location.formattedAddress)||formatAddress(location);
}
