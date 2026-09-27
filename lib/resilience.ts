export type RetryOptions={
 attempts?:number;
 baseDelayMs?:number;
 maxDelayMs?:number;
 shouldRetry?:(error:unknown)=>boolean;
};

function messageOf(error:unknown){
 if(error instanceof Error)return error.message.toLowerCase();
 if(typeof error==='string')return error.toLowerCase();
 if(error&&typeof error==='object'&&'message' in error)return String((error as {message?:unknown}).message??'').toLowerCase();
 return '';
}

export function isTransientReadError(error:unknown){
 const message=messageOf(error);
 if(!message)return false;
 return [
  'network request failed','failed to fetch','fetch failed','network error',
  'connection reset','connection closed','connection terminated','timeout','timed out',
  'temporarily unavailable','service unavailable','bad gateway','gateway timeout',
  '502','503','504','reconnecting','socket','econnreset'
 ].some(token=>message.includes(token));
}

export async function retryRead<T>(operation:()=>PromiseLike<T>,options:RetryOptions={}):Promise<T>{
 const attempts=Math.max(1,Math.min(options.attempts??3,4));
 const base=Math.max(50,options.baseDelayMs??250);
 const max=Math.max(base,options.maxDelayMs??1400);
 const retry=options.shouldRetry??isTransientReadError;
 let last:unknown;
 for(let attempt=1;attempt<=attempts;attempt++){
  try{return await operation()}catch(error){
   last=error;
   if(attempt>=attempts||!retry(error))throw error;
   const delay=Math.min(max,base*2**(attempt-1));
   await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }
 throw last;
}

export async function withTimeout<T>(operation:Promise<T>,timeoutMs:number,label='Operation'):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|null=null;
 try{
  return await Promise.race([
   operation,
   new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out`)),Math.max(250,timeoutMs))})
  ]);
 }finally{
  if(timer)clearTimeout(timer);
 }
}
