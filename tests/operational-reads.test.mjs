import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalRead,requireRead} from '../lib/operational-reads.ts';

test('a healthy source renders before an unrelated delayed source settles',async()=>{
 let release;const delayed=new Promise(resolve=>{release=resolve});const rendered=[];
 const slow=operationalRead(()=>delayed,value=>rendered.push(value),()=>{},()=>{},()=>true);
 await operationalRead(()=>Promise.resolve('jobs'),value=>rendered.push(value),()=>{},()=>{},()=>true);
 assert.deepEqual(rendered,['jobs']);release('tasks');await slow;assert.deepEqual(rendered,['jobs','tasks']);
});

test('returned permission errors clear only the failed source and mark it unknown',async()=>{
 let jobs=['job'];let tasks=['old task'];const status=[];
 await Promise.all([
  operationalRead(async()=>requireRead({data:null,error:{code:'42501'}}),value=>{tasks=value},()=>{tasks=[]},value=>status.push(value),()=>true),
  operationalRead(async()=>['current job'],value=>{jobs=value},()=>{jobs=[]},()=>{},()=>true),
 ]);
 assert.deepEqual(jobs,['current job']);assert.deepEqual(tasks,[]);assert.deepEqual(status,['loading','error']);
});

test('a superseded workspace cannot commit either success or error',async()=>{
 for(const fail of [false,true]){
  let release;let current=true;const events=[];
  const pending=new Promise(resolve=>{release=resolve});
  const read=operationalRead(async()=>{await pending;if(fail)throw Error('denied');return 'old business'},value=>events.push(value),()=>events.push('clear'),value=>events.push(value),()=>current);
  current=false;release();await read;assert.deepEqual(events,['loading']);
 }
});

test('empty success is distinct from a failed read and can recover locally',async()=>{
 let state;let data;let fail=true;
 const run=()=>operationalRead(async()=>{if(fail)throw Error('offline');return []},value=>{data=value},()=>{data=undefined},value=>{state=value},()=>true);
 await run();assert.equal(state,'error');assert.equal(data,undefined);
 fail=false;await run();assert.equal(state,'ready');assert.deepEqual(data,[]);
});
