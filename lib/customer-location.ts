import {Platform} from 'react-native';
import * as Location from 'expo-location';
import {supabase} from './supabase';

export type CustomerLocality={
 suburb:string;
 city:string;
 state:string;
 country:string;
 latitude:number;
 longitude:number;
 accuracy:number|null;
};

function clean(value:string|null|undefined){return (value??'').trim();}

async function reverseGeocodeWeb(latitude:number,longitude:number){
 try{
  const params=new URLSearchParams({format:'jsonv2',lat:String(latitude),lon:String(longitude),zoom:'16',addressdetails:'1'});
  const response=await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`,{headers:{Accept:'application/json'}});
  if(!response.ok)return null;
  const payload=await response.json() as {address?:Record<string,string|undefined>};
  const a=payload.address??{};
  const suburb=clean(a.suburb||a.neighbourhood||a.quarter||a.city_district||a.town||a.village);
  const city=clean(a.city||a.town||a.municipality||a.county||suburb);
  const state=clean(a.state||a.state_district||a.region||city);
  const country=clean(a.country);
  return suburb||city?{suburb:suburb||city,city:city||suburb,state,country}:null;
 }catch{return null;}
}

export async function resolveCustomerLocality(options:{requestIfUndetermined?:boolean}={}):Promise<CustomerLocality|null>{
 const existing=await Location.getForegroundPermissionsAsync();
 let status=existing.status;
 if(status==='undetermined'&&options.requestIfUndetermined!==false){
  status=(await Location.requestForegroundPermissionsAsync()).status;
 }
 if(status!=='granted')return null;

 const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
 let named:{suburb:string;city:string;state:string;country:string}|null=null;
 try{
  const places=await Location.reverseGeocodeAsync({latitude:current.coords.latitude,longitude:current.coords.longitude});
  const p=places[0];
  if(p){
   const suburb=clean(p.district||p.subregion||p.city);
   const city=clean(p.city||p.subregion||suburb);
   const state=clean(p.region||city);
   const country=clean(p.country);
   if(suburb||city)named={suburb:suburb||city,city:city||suburb,state,country};
  }
 }catch{/* Web fallback below. */}
 if(!named&&Platform.OS==='web')named=await reverseGeocodeWeb(current.coords.latitude,current.coords.longitude);
 if(!named)return null;

 return {...named,latitude:current.coords.latitude,longitude:current.coords.longitude,accuracy:current.coords.accuracy??null};
}

export async function saveLocalityToProfile(locality:CustomerLocality){
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return;
 const {error}=await supabase.from('profiles').update({
  suburb:locality.suburb||null,
  city:locality.city||null,
  state:locality.state||null,
  country:locality.country||null,
  updated_at:new Date().toISOString(),
 }).eq('id',user.id);
 if(error)throw new Error(error.message);
}

export function localityLabel(locality:Pick<CustomerLocality,'suburb'|'city'|'state'|'country'>){
 return [locality.suburb,locality.city&&locality.city!==locality.suburb?locality.city:'',locality.state,locality.country].filter(Boolean).join(', ');
}
