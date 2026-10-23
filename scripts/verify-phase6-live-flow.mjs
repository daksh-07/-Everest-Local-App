// Verify the boundary from actual Live start/release SQL to the quote-state contract.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {latestFunction} from './lib/phase6-sql-source.mjs';
const {db}=process.env.PHASE6_DATABASE_URL?await (await import('./lib/phase6-postgres.mjs')).disposablePostgres():{db:new (await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')).PGlite()};
const baseline=process.env.PHASE6_BASELINE==='1';
const report={scope:(process.env.PHASE6_DATABASE_URL?'PostgreSQL 17 loopback':'PGlite')+'; exact repository SQL with minimal fixtures, not Supabase staging',baseline,tests:[]};
const source=await fs.readFile('supabase/migrations/20260928172000_active_business_membership_and_live_hardening.sql','utf8');
const initial=await fs.readFile('supabase/migrations/20260926112442_everest_live_marketplace.sql','utf8');
const distance=initial.slice(initial.indexOf('create or replace function public.everest_distance_km('),initial.indexOf('revoke all on function public.everest_distance_km'));
const wave=source.slice(source.indexOf('create or replace function public.release_everest_live_wave('),source.indexOf('revoke all on function public.release_everest_live_wave'));
await db.exec(`
create table service_requests(id uuid primary key,is_live boolean,live_status text,live_expires_at timestamptz,status text,updated_at timestamptz,latitude numeric,longitude numeric,service_id uuid,service_definition_id uuid,delivery_mode text,category_id uuid,suburb text,city text,state text,live_radius_km numeric,live_radius_stage integer);
create table businesses(id uuid primary key,status text,verification_status text,accepts_requests boolean,latitude numeric,longitude numeric,category_id uuid);
create table services(id uuid primary key,business_id uuid,active boolean,service_definition_id uuid,delivery_mode text,category_id uuid);
create table business_availability(business_id uuid,status text,available_from timestamptz,available_until timestamptz);
create table business_members(business_id uuid,user_id uuid,status text);
create table driver_availability(driver_id uuid,status text,service_radius_km numeric);
create table service_provider_locations(provider_id uuid,latitude numeric,longitude numeric,recorded_at timestamptz);
create table service_dispatch_provider_config(provider_id uuid,travel_speed_kmh numeric);
create table service_dispatch_assignments(provider_id uuid,completed_at timestamptz);
create table service_areas(business_id uuid,active boolean,suburb text,city text,state text);
create table opportunities(request_id uuid,business_id uuid,status text,expires_at timestamptz,is_live boolean,notified_at timestamptz,approximate_distance_km numeric,eta_seconds integer,unique(request_id,business_id));
create table service_matches(request_id uuid,business_id uuid,score integer,reason jsonb,unique(request_id,business_id));
create function everest_live_audit(uuid,text,jsonb) returns void language sql as 'select';
create function dispatch_eta_proxy_seconds(numeric,numeric,numeric,numeric,numeric) returns integer language sql as 'select 100';
${distance}
${wave}
`);
const req='11111111-1111-4111-8111-111111111111',biz='33333333-3333-4333-8333-333333333333';
async function reset(){
 await db.exec(`truncate service_requests,businesses,services,business_availability,business_members,driver_availability,service_dispatch_assignments,service_areas,opportunities,service_matches;
 insert into service_requests(id,is_live,live_status,live_expires_at,latitude,longitude,delivery_mode,suburb,city,state) values('${req}',true,'SEARCHING',now()+interval '45 minutes',-37.8,144.96,'LOCAL','Carlton','Melbourne','VIC');
 insert into businesses values('${biz}','ACTIVE','VERIFIED',true,-37.801,144.961,null);
 insert into services values('${biz}','${biz}',true,null,'LOCAL',null);
 insert into business_availability values('${biz}','AVAILABLE_NOW',null,null);`);
}



await db.exec(`create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 alter table service_requests add column customer_id uuid,add column location_confirmed boolean,add column address_line1 text,add column live_started_at timestamptz,add column requested_arrival_window text;
 create table lifecycle_quotes(id uuid primary key default gen_random_uuid(),request_id uuid);
 create function quote_contract(p_id uuid) returns uuid language plpgsql as $$declare qid uuid;begin if (select status from service_requests where id=p_id)<>'QUOTING' then raise exception 'Request is not accepting quotes';end if;insert into lifecycle_quotes(request_id) values(p_id) returning id into qid;return qid;end$$;`);
// quote_contract isolates the unchanged send_quote_for_business QUOTING guard;
// it is NOT a replacement for that API or payment/fee validation.
async function fresh(){await reset();await db.exec(`update service_requests set is_live=false,status='OPEN',customer_id='${req}',location_confirmed=true,address_line1='Synthetic test address';select set_config('request.jwt.claim.sub','${req}',false)`);}
try{
 const start=await latestFunction('start_everest_live');await db.exec(start.sql);
 if(!baseline){
  const names=(await fs.readdir('supabase/migrations')).filter(name=>name.endsWith('_phase6_live_matching_correctness.sql')||name.endsWith('_phase6_live_request_quote_lifecycle.sql')).sort();
  for(const name of names)await db.exec(await fs.readFile('supabase/migrations/'+name,'utf8'));
 }
 for(const [name,run] of [
  ['released Live request is eligible for the existing QUOTING contract',async()=>{await fresh();await db.query("select start_everest_live($1,'ASAP')",[req]);await db.query('select quote_contract($1)',[req]);}],
  ['lost start response retry retains one OPEN offer',async()=>{await fresh();await db.query("select start_everest_live($1,'ASAP')",[req]);const expiry=(await db.query('select live_expires_at::text value from service_requests')).rows[0].value;await db.query("select start_everest_live($1,'ASAP')",[req]);assert.equal((await db.query("select count(*)::integer count from opportunities where status='OPEN'")).rows[0].count,1);assert.equal((await db.query('select live_expires_at::text value from service_requests')).rows[0].value,expiry);}],
  ['initial Live start offers are not reset by duplicate actions',async()=>{await fresh();await db.query("select start_everest_live($1,'ASAP')",[req]);await db.exec("update service_requests set live_status='RESPONSES_AVAILABLE'");await db.query("select start_everest_live($1,'ASAP')",[req]);assert.equal((await db.query('select live_status from service_requests')).rows[0].live_status,'RESPONSES_AVAILABLE');}],
  ['another customer cannot start this request',async()=>{await fresh();await db.exec(`select set_config('request.jwt.claim.sub','${biz}',false)`);await assert.rejects(db.query("select start_everest_live($1,'ASAP')",[req]),/Request not found/);}],
  ['unconfirmed local address cannot start Live',async()=>{await fresh();await db.exec('update service_requests set location_confirmed=false');await assert.rejects(db.query("select start_everest_live($1,'ASAP')",[req]),/confirmed precise service address/);}],
 ]){try{await run();report.tests.push({name,pass:true});}catch(error){report.tests.push({name,pass:false,error:error.message});}}
}finally{
 report.scope='Actual start/release functions in focused disposable database; synthetic quote-state guard only, not complete quote/payment flow';report.passed=report.tests.filter(t=>t.pass).length;report.failed=report.tests.length-report.passed;
 const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase6-live-flow';await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/live-flow-${baseline?'before':'after'}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await db.close();
}
assert.equal(report.failed,0);
