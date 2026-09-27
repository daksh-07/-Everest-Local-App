import {supabase} from './supabase';

type CacheEntry={url:string;expiresAt:number};
const signedUrlCache=new Map<string,CacheEntry>();
const EXPIRY_SAFETY_MS=120_000;

function cacheKey(bucket:string,path:string){return bucket+':'+path}

export function cachedMediaUrl(bucket:string,path:string|null|undefined){
 if(!path)return null;
 if(/^https?:\/\//i.test(path))return path;
 const hit=signedUrlCache.get(cacheKey(bucket,path));
 if(!hit)return null;
 if(hit.expiresAt-Date.now()<=EXPIRY_SAFETY_MS){signedUrlCache.delete(cacheKey(bucket,path));return null}
 return hit.url;
}

function remember(bucket:string,path:string,url:string,expires:number){
 signedUrlCache.set(cacheKey(bucket,path),{url,expiresAt:Date.now()+Math.max(300,expires)*1000});
 return url;
}

export async function signedMediaUrl(bucket:string,path:string|null|undefined,expires=3600){
 if(!path)return null;
 if(/^https?:\/\//i.test(path))return path;
 const cached=cachedMediaUrl(bucket,path);
 if(cached)return cached;
 const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,expires);
 if(error||!data?.signedUrl)return null;
 return remember(bucket,path,data.signedUrl,expires);
}

export async function signedMediaUrls(bucket:string,paths:(string|null|undefined)[],expires=3600){
 const result:Record<string,string|null>={};
 const missing:string[]=[];
 for(const raw of paths){
  if(!raw)continue;
  if(/^https?:\/\//i.test(raw)){result[raw]=raw;continue}
  const cached=cachedMediaUrl(bucket,raw);
  if(cached)result[raw]=cached;
  else if(!missing.includes(raw))missing.push(raw);
 }
 if(missing.length){
  const {data,error}=await supabase.storage.from(bucket).createSignedUrls(missing,expires);
  if(!error){
   (data??[]).forEach((row,index)=>{
    const path=(row as {path?:string}).path??missing[index];
    const url=(row as {signedUrl?:string}).signedUrl??null;
    if(path&&url)result[path]=remember(bucket,path,url,expires);
   });
  }
 }
 for(const path of missing)if(!(path in result))result[path]=null;
 return result;
}
