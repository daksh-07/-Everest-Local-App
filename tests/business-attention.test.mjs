import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/business-attention.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {activeBusinessOpportunities}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const now=Date.parse('2026-10-30T12:00:00Z');
const row={id:'one',request_id:'request-one',description:'Cleaner needed',status:'OPEN',expires_at:'2026-10-30T13:00:00Z'};
test('attention excludes expired, malformed, terminal and unaddressable opportunities',()=>{
 const result=activeBusinessOpportunities([row,{...row,id:'expired',expires_at:'2026-10-30T11:59:00Z'},{...row,id:'boundary',expires_at:'2026-10-30T12:00:00Z'},{...row,id:'bad',expires_at:'bad date'},{...row,id:'sent',status:'RESPONDED'},{...row,request_id:''}],now);
 assert.deepEqual(result.map(v=>v.id),['one']);
});
test('time-limited requests sort ahead of open-ended requests without mutating input',()=>{
 const rows=[{...row,id:'unlimited',expires_at:null},{...row,id:'later',expires_at:'2026-10-30T17:00:00Z'},row];
 assert.deepEqual(activeBusinessOpportunities(rows,now).map(v=>v.id),['one','later','unlimited']);assert.equal(rows[0].id,'unlimited');
});
test('equal deadlines use stable created date and id order',()=>{
 assert.deepEqual(activeBusinessOpportunities([{...row,id:'z'},{...row,id:'a'}],now).map(v=>v.id),['a','z']);
});
