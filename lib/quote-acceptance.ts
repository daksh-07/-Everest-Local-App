export class QuoteAcceptanceUnconfirmedError extends Error {
 constructor(){super('We could not confirm your choice. Check your bookings before choosing again.');this.name='QuoteAcceptanceUnconfirmedError';}
}

type AcceptanceOperations={readBooking:()=>Promise<string|null>;mutate:()=>Promise<string>};
// Reads may establish a previous commit. Never replay an uncertain mutation.
export async function acceptQuoteWithRecovery({readBooking,mutate}:AcceptanceOperations):Promise<string>{
 let existing:string|null;
 try{existing=await readBooking();}catch{throw new Error('We could not check this request. Reconnect before choosing a provider.');}
 if(existing)return existing;
 try{const id=await mutate();if(typeof id!=='string'||!id.trim())throw new Error('Missing booking confirmation');return id;}
 catch{
  try{const committed=await readBooking();if(committed)return committed;}catch{/* The outcome remains unknown. */}
  throw new QuoteAcceptanceUnconfirmedError();
 }
}
