import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type SearchHistoryEntry={
  id:string;
  query:string;
  tab:string;
  createdAt:string;
  country?:string;
};

const KEY='everest.search.history.v1';
const LIMIT=15;

async function readRaw(){
  if(Platform.OS==='web'){
    if(typeof window==='undefined')return null;
    return window.localStorage.getItem(KEY);
  }
  return SecureStore.getItemAsync(KEY);
}

async function writeRaw(value:string){
  if(Platform.OS==='web'){
    if(typeof window==='undefined')return;
    window.localStorage.setItem(KEY,value);
    return;
  }
  await SecureStore.setItemAsync(KEY,value);
}

export async function getSearchHistory():Promise<SearchHistoryEntry[]>{
  try{
    const raw=await readRaw();
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed
      .filter((item):item is SearchHistoryEntry=>Boolean(
        item&&(item.country===undefined||(typeof item.country==='string'&&item.country.length<=150))&&typeof item.id==='string'&&typeof item.query==='string'&&typeof item.tab==='string'&&typeof item.createdAt==='string',
      ))
      .slice(0,LIMIT);
  }catch{
    return [];
  }
}

export async function addSearchHistory(query:string,tab:string,country?:string){
  const clean=query.trim().replace(/\s+/g,' ').slice(0,100);
  if(!clean)return getSearchHistory();

  const scope=country?.trim().slice(0,150)||undefined;
  const current=await getSearchHistory();
  const deduped=current.filter(item=>item.query.toLowerCase()!==clean.toLowerCase()||item.tab!==tab||(item.country||'').toLowerCase()!==(scope||'').toLowerCase());
  const next:[SearchHistoryEntry,...SearchHistoryEntry[]]=[
    {
      id:String(Date.now())+'-'+Math.random().toString(36).slice(2,8),
      query:clean,
      tab,
      createdAt:new Date().toISOString(),
      ...(scope?{country:scope}:{}),
    },
    ...deduped,
  ];
  const limited=next.slice(0,LIMIT);
  await writeRaw(JSON.stringify(limited));
  return limited;
}

export async function removeSearchHistory(id:string){
  const current=await getSearchHistory();
  const next=current.filter(item=>item.id!==id);
  await writeRaw(JSON.stringify(next));
  return next;
}

export async function clearSearchHistory(){
  await writeRaw('[]');
  return [] as SearchHistoryEntry[];
}
