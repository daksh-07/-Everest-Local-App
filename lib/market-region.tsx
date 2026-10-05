import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {supabase,supabaseConfigured} from './supabase';
import {MARKETS,inferDeviceMarket,type MarketCode,type MarketConfig} from './markets';
import {resolveCurrentMarketCode} from './current-market';

type MarketRegionValue={
 code:MarketCode;
 market:MarketConfig;
 loading:boolean;
 isIndia:boolean;
 refresh:()=>Promise<void>;
};

const fallbackCode=inferDeviceMarket();
const MarketRegionContext=createContext<MarketRegionValue>({
 code:fallbackCode,
 market:MARKETS[fallbackCode],
 loading:false,
 isIndia:fallbackCode==='IN',
 refresh:async()=>undefined,
});

export function MarketRegionProvider({children}:{children:ReactNode}){
 const [code,setCode]=useState<MarketCode>(fallbackCode);
 const [loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{
  try{setCode(await resolveCurrentMarketCode())}
  finally{setLoading(false)}
 },[]);

 useEffect(()=>{
  let active=true;
  const sync=async()=>{
   const next=await resolveCurrentMarketCode().catch(()=>inferDeviceMarket());
   if(active){setCode(next);setLoading(false)}
  };
  void sync();
  if(!supabaseConfigured)return()=>{active=false};
  const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{void sync()});
  return()=>{active=false;subscription.unsubscribe()};
 },[]);

 const value=useMemo<MarketRegionValue>(()=>({code,market:MARKETS[code],loading,isIndia:code==='IN',refresh}),[code,loading,refresh]);
 return <MarketRegionContext.Provider value={value}>{children}</MarketRegionContext.Provider>;
}

export function useMarketRegion(){return useContext(MarketRegionContext)}
