export type WeatherCondition='CLEAR'|'PARTLY_CLOUDY'|'OVERCAST'|'FOG'|'DRIZZLE'|'RAIN'|'SNOW'|'STORM';

export type CurrentWeather={
 condition:WeatherCondition;
 temperatureC:number;
 isDay:boolean;
 label:string;
 provider:'open-meteo';
 fetchedAt:number;
};

type OpenMeteoResponse={
 current?:{
  temperature_2m?:number;
  weather_code?:number;
  is_day?:number;
 };
};

const WEATHER_CACHE_MS=20*60_000;
const WEATHER_TIMEOUT_MS=6500;
const cache=new Map<string,{expiresAt:number;value:CurrentWeather}>();
const inflight=new Map<string,Promise<CurrentWeather|null>>();

function coordinateKey(latitude:number,longitude:number){
 return latitude.toFixed(2)+':'+longitude.toFixed(2);
}

export function weatherConditionForCode(code:number):WeatherCondition{
 if(code===0||code===1)return 'CLEAR';
 if(code===2)return 'PARTLY_CLOUDY';
 if(code===3)return 'OVERCAST';
 if(code===45||code===48)return 'FOG';
 if(code>=51&&code<=57)return 'DRIZZLE';
 if((code>=61&&code<=67)||(code>=80&&code<=82))return 'RAIN';
 if((code>=71&&code<=77)||(code>=85&&code<=86))return 'SNOW';
 if(code>=95&&code<=99)return 'STORM';
 return 'OVERCAST';
}

function weatherLabel(condition:WeatherCondition,isDay:boolean){
 switch(condition){
  case 'CLEAR':return isDay?'Clear':'Clear night';
  case 'PARTLY_CLOUDY':return 'Partly cloudy';
  case 'OVERCAST':return 'Cloudy';
  case 'FOG':return 'Foggy';
  case 'DRIZZLE':return 'Drizzle';
  case 'RAIN':return 'Rain';
  case 'SNOW':return 'Snow';
  case 'STORM':return 'Thunderstorm';
 }
}

async function requestOpenMeteo(latitude:number,longitude:number):Promise<CurrentWeather|null>{
 const controller=typeof AbortController!=='undefined'?new AbortController():null;
 const timer=controller?setTimeout(()=>controller.abort(),WEATHER_TIMEOUT_MS):null;
 try{
  const url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(String(latitude))+
   '&longitude='+encodeURIComponent(String(longitude))+
   '&current=temperature_2m,weather_code,is_day&temperature_unit=celsius&timezone=auto&forecast_days=1';
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller?.signal});
  if(!response.ok)return null;
  const payload=await response.json() as OpenMeteoResponse;
  const current=payload.current;
  const temperatureC=Number(current?.temperature_2m);
  const code=Number(current?.weather_code);
  const isDay=Number(current?.is_day)===1;
  if(!Number.isFinite(temperatureC)||!Number.isFinite(code))return null;
  const condition=weatherConditionForCode(code);
  return{condition,temperatureC,isDay,label:weatherLabel(condition,isDay),provider:'open-meteo',fetchedAt:Date.now()};
 }catch{return null}finally{if(timer)clearTimeout(timer)}
}

export async function getCurrentWeather(input:{latitude:number;longitude:number}):Promise<CurrentWeather|null>{
 const latitude=Number(input.latitude),longitude=Number(input.longitude);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<-90||latitude>90||longitude<-180||longitude>180)return null;
 const key=coordinateKey(latitude,longitude);
 const cached=cache.get(key);
 if(cached&&cached.expiresAt>Date.now())return cached.value;
 const pending=inflight.get(key);
 if(pending)return pending;
 const request=requestOpenMeteo(latitude,longitude).then(value=>{
  if(value){
   cache.set(key,{expiresAt:Date.now()+WEATHER_CACHE_MS,value});
   if(cache.size>12){const oldest=cache.keys().next().value as string|undefined;if(oldest)cache.delete(oldest)}
  }
  return value;
 }).finally(()=>inflight.delete(key));
 inflight.set(key,request);
 return request;
}
