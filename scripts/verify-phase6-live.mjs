import {installCountryMatchingFixture} from './lib/country-matching-fixture.mjs';
// Executes the checked-in Live wave function in disposable PostgreSQL, never production.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
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
async function release(){return (await db.query('select release_everest_live_wave($1,3,1) as count',[req])).rows[0].count;}

const cases=[
 ['named area cannot bypass local distance',`update businesses set latitude=-33.86,longitude=151.2;insert into service_areas values('${biz}',true,'Carlton','Melbourne','VIC')`,0,true],
 ['AVAILABLE_NOW honors future available_from',"update business_availability set available_from=now()+interval '2 hours'",0,true],
 ['removed member assignment does not exclude business',`insert into business_members values('${biz}','${biz}','REMOVED');insert into service_dispatch_assignments values('${biz}',null)`,1,true],
 ['nearby capable verified provider','',1],
 ['same coordinates in another country are excluded',"update service_requests set country='Canada'",0],
 ['missing request country is not guessed from locality',"update service_requests set country=null",0],
 ['missing business country is not guessed from coordinates',"update businesses set country=''",0],
 ['known country aliases preserve eligible service',"update service_requests set country='AU'",1],
 ['matching nearby named area remains eligible',`insert into service_areas values('${biz}',true,'Carlton','Melbourne','VIC')`,1],
 ['named area cannot bypass online provider radius',`update businesses set latitude=-37.82;insert into service_areas values('${biz}',true,'Carlton','Melbourne','VIC');insert into business_members values('${biz}','${biz}','ACTIVE');insert into driver_availability values('${biz}','ONLINE',0.1)`,0],
 ['named area cannot replace missing coordinates',`update businesses set latitude=null;insert into service_areas values('${biz}',true,'Carlton','Melbourne','VIC')`,0],
 ['null availability start is immediately available','',1],
 ['past availability start is available',"update business_availability set available_from=now()-interval '1 minute'",1],
 ['offline provider excluded',"update business_availability set status='OFFLINE'",0],
 ['expired availability excluded',"update business_availability set available_until=now()-interval '1 minute'",0],
 ['active member unfinished assignment still excludes business',`insert into business_members values('${biz}','${biz}','ACTIVE');insert into service_dispatch_assignments values('${biz}',null)`,0],
 ['suspended member assignment does not exclude business',`insert into business_members values('${biz}','${biz}','SUSPENDED');insert into service_dispatch_assignments values('${biz}',null)`,1],
 ['completed active assignment does not exclude business',`insert into business_members values('${biz}','${biz}','ACTIVE');insert into service_dispatch_assignments values('${biz}',now())`,1],
 ['unverified business excluded',"update businesses set verification_status='PENDING'",0],
 ['inactive business excluded',"update businesses set status='SUSPENDED'",0],
 ['requests disabled business excluded','update businesses set accepts_requests=false',0],
 ['inactive capability excluded','update services set active=false',0],
 ['wrong niche excluded',`update service_requests set service_definition_id='22222222-2222-4222-8222-222222222222'`,0],
 ['wrong category excluded',`update service_requests set category_id='22222222-2222-4222-8222-222222222222'`,0],
 ['wrong service excluded',`update service_requests set service_id='22222222-2222-4222-8222-222222222222'`,0],
 ['remote capability globally eligible',"update service_requests set delivery_mode='REMOTE';update services set delivery_mode='REMOTE';update businesses set latitude=-33.86,longitude=151.2",1],
 ['remote does not require coordinates',"update service_requests set delivery_mode='REMOTE',latitude=null,longitude=null;update services set delivery_mode='BOTH';update businesses set latitude=null,longitude=null",1],
 ['remote still requires availability',"update service_requests set delivery_mode='REMOTE';update services set delivery_mode='REMOTE';update business_availability set available_from=now()+interval '1 hour'",0],
 ['remote still requires matching capability',"update service_requests set delivery_mode='REMOTE'",0],
 ['cancelled lifecycle cannot release',"update service_requests set live_status='CANCELLED'",0],
 ['non-Live request cannot release','update service_requests set is_live=false',0],
];
try{
 if(!baseline){
  const migrations=(await fs.readdir('supabase/migrations')).filter(name=>name.endsWith('_phase6_live_matching_correctness.sql')||name.endsWith('_phase6_live_request_quote_lifecycle.sql')).sort();
  if(!migrations.length)throw new Error('Phase 6 matching migration is missing');
  await db.exec("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;");for(const migration of migrations)await db.exec(await fs.readFile('supabase/migrations/'+migration,'utf8'));await installCountryMatchingFixture(db);
 }
 for(const [name,sql,expected,regression] of cases){
  if(baseline&&!regression)continue;await reset();if(sql)await db.exec(sql);const actual=await release();report.tests.push({name,expected,actual,pass:actual===expected});
 }
 if(!baseline){
  await reset();assert.equal(await release(),1);assert.equal(await release(),0);assert.equal((await db.query('select * from opportunities')).rows.length,1);report.tests.push({name:'repeat wave is idempotent; one offer/match',pass:true});
  const expiry=(await db.query("select expires_at<=now()+interval '20 minutes' as bounded from opportunities")).rows[0];assert.equal(expiry.bounded,true);report.tests.push({name:'offer expiry remains bounded by 20 minutes',pass:true});
  await reset();await db.exec("update service_requests set live_expires_at=now()+interval '2 minutes'");await release();assert.equal((await db.query('select expires_at=(select live_expires_at from service_requests) bounded from opportunities')).rows[0].bounded,true);report.tests.push({name:'offer expiry bounded by request expiry',pass:true});
  await reset();await db.exec("update service_requests set live_expires_at=now()-interval '1 minute'");assert.equal(await release(),0);assert.equal((await db.query('select live_status from service_requests')).rows[0].live_status,'EXPIRED');report.tests.push({name:'expired request closes without offers',pass:true});
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.release_everest_live_wave($1,3,1)',[req]),/permission denied/);await db.exec('reset role');report.tests.push({name:role+' cannot invoke internal wave',pass:true});}
 }
}finally{
 report.passed=report.tests.filter(test=>test.pass).length;report.failed=report.tests.length-report.passed;
 const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase6-sql';await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/live-${baseline?'before':'after'}.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));await db.close();
}
assert.equal(report.failed,0,`${report.failed} Live matching regressions failed`);
