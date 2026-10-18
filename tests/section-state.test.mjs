import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionStart,sectionFailure,readResult} from '../lib/section-state.ts';
const loaded={key:'garden:SERVICE:guest',data:[{id:1}],loading:false,error:false};
test('same-scope retry retains data; different query/tab/viewer discards it',()=>{
 assert.deepEqual(sectionStart(loaded,loaded.key).data,loaded.data);
 for(const key of ['plumber:SERVICE:guest','garden:BUSINESS:guest','garden:SERVICE:member'])assert.equal(sectionStart(loaded,key).data,null);
});
test('transient failure preserves known data and permission failure clears it',()=>{
 const result=sectionFailure(loaded,new Error('Failed to fetch'));
 assert.deepEqual(result.data,loaded.data);assert.equal(result.error,true);assert.equal(result.loading,false);
 for(const error of [{code:'42501'},{code:'PGRST301'},new Error('permission denied for table'),new Error('Authentication required')])assert.equal(sectionFailure(loaded,error).data,null);
});
test('successful empty content differs from failed or null reads',async()=>{
 assert.deepEqual(await readResult(Promise.resolve({data:[],error:null})),[]);
 await assert.rejects(readResult(Promise.resolve({data:[],error:new Error('unavailable')})),/unavailable/);
 await assert.rejects(readResult(Promise.resolve({data:null,error:null})),/Content unavailable/);
});
