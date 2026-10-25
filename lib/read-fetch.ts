/** Bound idempotent REST reads only. Mutation/payment requests keep their own semantics. */
export function createReadFetch(fetcher:typeof fetch,timeoutMs=12_000):typeof fetch {
 return async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const method=(init?.method??(typeof Request!=='undefined'&&input instanceof Request?input.method:'GET')).toUpperCase();
  const path=new URL(url).pathname;
  const read=path.startsWith('/rest/v1/')&&(
   method==='GET'||method==='HEAD'||(method==='POST'&&['/rest/v1/rpc/get_my_access_context','/rest/v1/rpc/get_my_workspace_context'].includes(path))
  );
  if(!read)return fetcher(input,init);
  const controller=new AbortController();
  const signal=init?.signal??(typeof Request!=='undefined'&&input instanceof Request?input.signal:null);
  const abort=()=>controller.abort(signal?.reason);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('Loading content timed out. Please retry.')),timeoutMs);
  try{return await fetcher(input,{...init,signal:controller.signal})}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 };
}
