import {MARKETS,inferDeviceMarket,normalizeCountry,type MarketCode} from './markets';
import {supabase,supabaseConfigured} from './supabase';

export async function resolveCurrentMarketCode():Promise<MarketCode>{
 const inferred=inferDeviceMarket();
 if(!supabaseConfigured)return inferred;
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return inferred;
 const {data,error}=await supabase.from('profiles').select('country,suburb,city,state').eq('id',user.id).maybeSingle();
 if(error)return inferred;
 const saved=normalizeCountry(data?.country);
 const hasSavedLocality=Boolean(data?.suburb?.trim()||data?.city?.trim()||data?.state?.trim());
 if(saved==='IN')return 'IN';
 if(saved==='AU'&&hasSavedLocality)return 'AU';
 return inferred;
}

export async function resolveCurrentMarket(){
 const code=await resolveCurrentMarketCode();
 return MARKETS[code];
}
