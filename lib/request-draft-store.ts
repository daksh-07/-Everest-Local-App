import {z} from 'zod';

export const REQUEST_DRAFT_TTL_MS=7*24*60*60*1000;
const prefix='everest-request-draft.v1.';
const registryKey=prefix+'owners';
const id=z.string().uuid();
const text=(max:number)=>z.string().max(max);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value});
const mode=z.enum(['LOCAL','REMOTE','BOTH']);
const address=z.object({addressLine1:text(300),suburb:text(150),city:text(150),state:text(150),postalCode:text(40),country:text(150)});
const inputSchema=z.object({
 idempotencyKey:z.string().min(16).max(128),categoryId:id.optional(),serviceDefinitionId:id.optional(),serviceId:id.optional(),description:text(5000),
 suburb:text(150).optional(),city:text(150).optional(),state:text(150).optional(),country:text(150).optional(),addressLine1:text(300).optional(),postalCode:text(40).optional(),serviceAddressLabel:text(1500).optional(),
 latitude:z.number().finite().min(-90).max(90).optional(),longitude:z.number().finite().min(-180).max(180).optional(),locationAccuracyM:z.number().finite().nonnegative().optional(),
 locationSource:z.enum(['PROFILE','DEVICE','MANUAL','REMOTE']).optional(),locationConfirmed:z.boolean().optional(),preferredDate:date.optional(),preferredTime:text(5).optional(),
 timingMode:z.enum(['ASAP','FLEXIBLE','TIME_WINDOW','EXACT_TIME']).optional(),timeWindowStart:text(5).optional(),timeWindowEnd:text(5).optional(),
 budget:z.number().finite().nonnegative().optional(),budgetMin:z.number().finite().nonnegative().optional(),budgetMax:z.number().finite().nonnegative().optional(),deliveryMode:mode.optional(),
});
export const requestDraftSchema=z.object({
 version:z.literal(1),ownerId:id,savedAt:z.number().finite(),
 entry:z.object({serviceId:z.union([id,z.literal('')]),live:z.boolean(),mode}),
 form:z.object({description:text(5000),definitionId:z.union([id,z.literal('')]),mode,location:address,
  date:date.nullable(),timing:z.enum(['ASAP','FLEXIBLE','TIME_WINDOW','EXACT_TIME']),arrivalWindow:z.enum(['ASAP','WITHIN_30_MINUTES','WITHIN_1_HOUR','TODAY']),
  windowKey:z.enum(['MORNING','AFTERNOON','EVENING']).nullable(),exactTime:text(5).nullable(),budgetChoice:z.enum(['NONE','UNDER_100','100_250','250_500','500_PLUS','CUSTOM']),customBudget:text(30),
 }),
 // Present only once the user explicitly posts. Reuse this immutable payload/key after uncertain outcomes.
 attempt:inputSchema.optional(),
});
export type RequestDraft=z.infer<typeof requestDraftSchema>;
export interface DraftStorage {get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;remove(key:string):Promise<void>}

// One serial queue makes manifest replacement, background flush, discard and logout ordered.
// Native values are small Unicode-safe chunks; readers see only a complete committed generation.
export function createRequestDraftStore(storage:DraftStorage,now=()=>Date.now()){
 let tail=Promise.resolve();let epoch=0;
 const enqueue=<T>(action:()=>Promise<T>)=>{const next=tail.then(action,action);tail=next.then(()=>undefined,()=>undefined);return next};
 const owners=async()=>{try{const value=JSON.parse(await storage.get(registryKey)||'[]');return Array.isArray(value)?value.filter(v=>id.safeParse(v).success) as string[]:[]}catch{return []}};
 const manifest=async(owner:string,suffix='')=>{try{const raw=JSON.parse(await storage.get(prefix+owner+suffix)||'null');return raw&&typeof raw.generation==='string'&&/^[a-z0-9-]+$/.test(raw.generation)&&Number.isInteger(raw.count)&&raw.count>0&&raw.count<=150?raw as {generation:string;count:number}:null}catch{return null}};
 const removeParts=async(owner:string,m:Awaited<ReturnType<typeof manifest>>)=>{if(m)for(let i=0;i<m.count;i++)await storage.remove(`${prefix}${owner}.${m.generation}.${i}`)};
 const cleanPending=async(owner:string)=>{const pending=await manifest(owner,'.pending');const committed=await manifest(owner);if(pending?.generation!==committed?.generation)await removeParts(owner,pending);await storage.remove(prefix+owner+'.pending')};
 const erase=async(owner:string)=>{await cleanPending(owner);const old=await manifest(owner);await removeParts(owner,old);await storage.remove(prefix+owner)};
 return {
  open(ownerId:string){
   id.parse(ownerId);const sessionEpoch=epoch;let closed=false;
   const guard=()=>{if(closed||epoch!==sessionEpoch)throw new Error('This draft session has ended.')};
   return {
    load:()=>enqueue(async()=>{guard();await cleanPending(ownerId);const m=await manifest(ownerId);if(!m)return null;
     let raw='';for(let i=0;i<m.count;i++){const chunk=await storage.get(`${prefix}${ownerId}.${m.generation}.${i}`);if(chunk===null){await erase(ownerId);return null}raw+=chunk}
     let parsed;try{parsed=requestDraftSchema.safeParse(JSON.parse(raw))}catch{await erase(ownerId);return null}
     if(!parsed.success||parsed.data.ownerId!==ownerId||parsed.data.savedAt>now()+60_000||now()-parsed.data.savedAt>REQUEST_DRAFT_TTL_MS){await erase(ownerId);return null}
     return parsed.data;
    }),
    save(value:RequestDraft){
     guard();const capturedEpoch=epoch;const data=requestDraftSchema.parse({...value,ownerId,savedAt:now()});
     return enqueue(async()=>{if(epoch!==capturedEpoch)throw new Error('This draft session has ended.');
      await cleanPending(ownerId);const old=await manifest(ownerId);const registered=await owners();if(!registered.includes(ownerId))await storage.set(registryKey,JSON.stringify([...registered,ownerId]));
      const generation=now().toString(36)+'-'+Math.random().toString(36).slice(2);const chars=Array.from(JSON.stringify(data));const chunks=[];for(let i=0;i<chars.length;i+=400)chunks.push(chars.slice(i,i+400).join(''));
      if(chunks.length>150)throw new Error('This request draft is too large.');
      await storage.set(prefix+ownerId+'.pending',JSON.stringify({generation,count:chunks.length}));
      try{for(let i=0;i<chunks.length;i++)await storage.set(`${prefix}${ownerId}.${generation}.${i}`,chunks[i]);
       if(epoch!==capturedEpoch)throw new Error('This draft session has ended.');
       await storage.set(prefix+ownerId,JSON.stringify({generation,count:chunks.length}));
       await storage.remove(prefix+ownerId+'.pending').catch(()=>undefined);
      }catch(e){for(let i=0;i<chunks.length;i++)await storage.remove(`${prefix}${ownerId}.${generation}.${i}`).catch(()=>undefined);throw e}
      await removeParts(ownerId,old).catch(()=>undefined);
     });
    },
    clear:()=>enqueue(async()=>{guard();await erase(ownerId)}),
    close(){closed=true},
   };
  },
  clearAll(){epoch++;return enqueue(async()=>{for(const owner of await owners())await erase(owner);await storage.remove(registryKey)})},
 };
}

/** Compare local calendar preferences; flexible requests without a date remain valid. */
export function hasPastRequestedTime(input:{preferredDate?:string;preferredTime?:string;timingMode?:string},now=new Date()){
 if(!input.preferredDate)return false;
 const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 if(input.preferredDate<today)return true;
 return input.timingMode==='EXACT_TIME'&&Boolean(input.preferredTime)&&new Date(input.preferredDate+'T'+input.preferredTime+':00').getTime()<now.getTime();
}
