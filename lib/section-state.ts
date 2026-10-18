/** A failed read is unknown, never an empty collection. */
export type SectionState<T>={key:string|null;data:T|null;loading:boolean;error:boolean};
export function sectionStart<T>(previous:SectionState<T>,key:string):SectionState<T>{
 return {key,data:previous.key===key?previous.data:null,loading:true,error:false};
}
export function sectionFailure<T>(previous:SectionState<T>,error:unknown):SectionState<T>{
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
 const denied=['42501','401','403','PGRST301','PGRST302','PGRST116'].includes(code)||/permission denied|not authorized|jwt expired|authentication required/i.test(message);
 return {...previous,data:denied?null:previous.data,loading:false,error:true};
}
export async function readResult<T>(request:PromiseLike<{data:T;error:unknown}>):Promise<NonNullable<T>>{
 const result=await request;if(result.error)throw result.error;
 if(result.data===null||result.data===undefined)throw new Error('Content unavailable');
 return result.data;
}
