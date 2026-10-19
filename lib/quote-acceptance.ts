export class QuoteAcceptanceUnconfirmedError extends Error {
 constructor(){super('We could not confirm your choice. Check your bookings before choosing again.');this.name='QuoteAcceptanceUnconfirmedError';}
}

type AcceptanceOperations={readBooking:()=>Promise<string|null>;mutate:()=>Promise<string>;timeoutMs?:number};
async function bounded<T>(operation:()=>Promise<T>,timeoutMs:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Request timed out')),timeoutMs);})]);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
// Reads may establish a previous commit. Never replay an uncertain mutation.
export async function acceptQuoteWithRecovery({readBooking,mutate,timeoutMs=20000}:AcceptanceOperations):Promise<string>{
 let existing:string|null;
 try{existing=await bounded(readBooking,timeoutMs);}catch{throw new Error('We could not check this request. Reconnect before choosing a provider.');}
 if(existing)return existing;
 try{const id=await bounded(mutate,timeoutMs);if(typeof id!=='string'||!id.trim())throw new Error('Missing booking confirmation');return id;}
 catch{
  try{const committed=await bounded(readBooking,timeoutMs);if(committed)return committed;}catch{/* The outcome remains unknown. */}
  throw new QuoteAcceptanceUnconfirmedError();
 }
}
