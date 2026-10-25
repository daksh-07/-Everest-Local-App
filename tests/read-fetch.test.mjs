/* global Response, AbortController */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadFetch} from '../lib/read-fetch.ts';
const rest='https://fixture.invalid/rest/v1/';
const hangs=(_input,{signal})=>new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true})});
test('hung REST reads and bootstrap RPCs abort and subsequent retry succeeds',async()=>{
 for(const [path,method] of [['profiles','GET'],['profiles','HEAD'],['rpc/get_my_access_context','POST'],['rpc/get_my_workspace_context','POST']]){
  await assert.rejects(createReadFetch(hangs,10)(rest+path,{method}),/timed out/);
 }
 const result=await createReadFetch(async()=>new Response('ok'),10)(rest+'profiles');assert.equal(await result.text(),'ok');
});
test('caller cancellation propagates',async()=>{
 const controller=new AbortController();const promise=createReadFetch(hangs,1000)(rest+'profiles',{signal:controller.signal});controller.abort(new Error('caller cancelled'));await assert.rejects(promise,/caller cancelled/);
});
test('writes, payment RPCs, auth and Edge Functions are passed through unchanged',async()=>{
 for(const [url,method] of [[rest+'profiles','POST'],[rest+'profiles','PATCH'],[rest+'rpc/accept_quote','POST'],[rest+'rpc/get_or_create_business_inquiry','POST'],['https://fixture.invalid/functions/v1/checkout','POST'],['https://fixture.invalid/auth/v1/token','POST']]){
  const init={method};let called=false;await createReadFetch(async(input,options)=>{called=true;assert.equal(input,url);assert.equal(options,init);return new Response('ok')},1)(url,init);assert.ok(called);
 }
});
