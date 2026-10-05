export type MarketCode='AU'|'IN';

export type MarketConfig={
 code:MarketCode;
 countryName:string;
 countryCode:string;
 currency:'AUD'|'INR';
 locale:string;
 phonePrefix:string;
 postalLabel:string;
 paymentRail:'CARD'|'UPI';
};

export const MARKETS:Record<MarketCode,MarketConfig>={
 AU:{code:'AU',countryName:'Australia',countryCode:'au',currency:'AUD',locale:'en-AU',phonePrefix:'+61',postalLabel:'Postcode',paymentRail:'CARD'},
 IN:{code:'IN',countryName:'India',countryCode:'in',currency:'INR',locale:'en-IN',phonePrefix:'+91',postalLabel:'PIN code',paymentRail:'UPI'},
};

export function normalizeCountry(value:string|null|undefined):MarketCode|null{
 const raw=(value??'').trim().toUpperCase();
 if(!raw)return null;
 if(raw==='IN'||raw==='IND'||raw==='INDIA'||raw.includes('INDIA')||raw==='BHARAT')return 'IN';
 if(raw==='AU'||raw==='AUS'||raw==='AUSTRALIA'||raw.includes('AUSTRALIA'))return 'AU';
 return null;
}

export function inferDeviceMarket():MarketCode{
 try{
  const resolved=Intl.DateTimeFormat().resolvedOptions();
  const timeZone=(resolved.timeZone??'').toLowerCase();
  if(timeZone==='asia/kolkata'||timeZone==='asia/calcutta')return 'IN';
  const locales=[resolved.locale];
  if(typeof navigator!=='undefined'){
   if(Array.isArray(navigator.languages))locales.push(...navigator.languages);
   if(navigator.language)locales.push(navigator.language);
  }
  if(locales.some(locale=>/(?:-|_)in(?:$|-|_)/i.test(locale)))return 'IN';
 }catch{/* Fall through to launch market. */}
 return 'AU';
}

export function marketForCountry(value:string|null|undefined):MarketConfig{
 return MARKETS[normalizeCountry(value)??inferDeviceMarket()];
}

export function formatMarketMoney(value:number,market:MarketCode,options:{maximumFractionDigits?:number;minimumFractionDigits?:number}={}){
 const config=MARKETS[market];
 return new Intl.NumberFormat(config.locale,{
  style:'currency',
  currency:config.currency,
  maximumFractionDigits:options.maximumFractionDigits??(market==='IN'?0:2),
  minimumFractionDigits:options.minimumFractionDigits??0,
 }).format(Number(value||0));
}
