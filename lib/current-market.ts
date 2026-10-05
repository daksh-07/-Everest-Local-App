import {MARKETS,inferDeviceMarket,normalizeCountry,type MarketCode} from './markets';
import {supabase,supabaseConfigured} from './supabase';

export async function resolveCurrentMarketCode():Promise<MarketCode>{
 const inferred=inferDeviceMarket();
 if(!supabaseConfigured)return inferred;
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return inferred;
 const {data,error}=await supabase.from('profiles').select('country').eq('id',user.id).maybeSingle();
 if(error)return inferred;
 return normalizeCountry(data?.country)??inferred;
}

export async function resolveCurrentMarket(){
 const code=await resolveCurrentMarketCode();
 return MARKETS[code];
}
