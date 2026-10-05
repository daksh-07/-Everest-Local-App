import {normalizeCountry,type MarketCode} from './markets';
import {supabase} from './supabase';

function countryMatchesMarket(country:string|null|undefined,market:MarketCode){
 const normalized=normalizeCountry(country);
 if(market==='IN')return normalized==='IN';
 return normalized==='AU'||normalized===null;
}

export async function allowedBusinessIdsForMarket(ids:string[],market:MarketCode){
 const unique=[...new Set(ids.filter(Boolean))];
 if(!unique.length)return new Set<string>();
 const {data,error}=await supabase.from('businesses').select('id,country').in('id',unique);
 if(error)throw error;
 return new Set((data??[]).filter(row=>countryMatchesMarket(row.country,market)).map(row=>row.id));
}

export async function filterMarketplaceRowsByBusiness<T>(rows:T[],businessId:(row:T)=>string|null|undefined,market:MarketCode){
 const ids=rows.map(businessId).filter((id):id is string=>Boolean(id));
 const allowed=await allowedBusinessIdsForMarket(ids,market);
 return rows.filter(row=>{
  const id=businessId(row);
  return !id||allowed.has(id);
 });
}

export function assertBusinessCountryForMarket(country:string|null|undefined,market:MarketCode){
 if(!countryMatchesMarket(country,market))throw new Error('This item is not available in your current Everest market.');
}
