// Destructive test databases are allowed only on an explicitly supplied loopback server.
// This helper never connects to Supabase or accepts a remote database URL.
import assert from 'node:assert/strict';
import {URL} from 'node:url';
export async function disposablePostgres(){
 const url=new URL(process.env.PHASE6_DATABASE_URL||'');
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Phase 6 SQL tests require loopback PostgreSQL');
 const {default:pg}=await import(process.env.PG_MODULE||'pg');
 const admin=new pg.Client({connectionString:url.href});await admin.connect();
 await admin.query("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;");
 const name=`phase6_${process.pid}_${Date.now()}`;
 await admin.query(`create database ${name}`);
 url.pathname='/'+name;const clients=[];
 async function connect(){const client=new pg.Client({connectionString:url.href});await client.connect();clients.push(client);return client;}
 const client=await connect();
 return {connect,db:{exec:sql=>client.query(sql),query:(sql,params)=>client.query(sql,params),close:async()=>{try{for(const connection of clients)await connection.end();await admin.query(`drop database ${name} with (force)`);}finally{await admin.end();}}}};
}
