import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import {disposablePostgres} from '../scripts/lib/phase6-postgres.mjs';
for(const host of ['db.example.invalid','127.0.0.1.example.invalid'])test('destructive SQL fixture rejects remote host '+host,async()=>{
 const previous=process.env.PHASE6_DATABASE_URL;
 try{process.env.PHASE6_DATABASE_URL=`postgresql://fixture@${host}/postgres`;await assert.rejects(disposablePostgres(),/require loopback PostgreSQL/);process.env.PHASE6_DATABASE_URL='postgresql://fixture@127.0.0.1/postgres?host=db.example.invalid';await assert.rejects(disposablePostgres(),/reject connection parameter overrides/);}finally{if(previous===undefined)delete process.env.PHASE6_DATABASE_URL;else process.env.PHASE6_DATABASE_URL=previous;}
});
