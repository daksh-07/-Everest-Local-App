// Executes the checked-in Live wave function in disposable PostgreSQL, never production.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
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
const checks=[];
await reset();assert.equal(await release(),1);assert.equal(await release(),0);checks.push('Nearby provider offered once, repeated wave creates no duplicate');
await reset();await db.exec("update business_availability set status='OFFLINE'");assert.equal(await release(),0);checks.push('Offline provider excluded');
await reset();await db.exec("update business_availability set available_until=now()-interval '1 minute'");assert.equal(await release(),0);checks.push('Expired availability excluded');
await reset();await db.exec("update service_requests set live_expires_at=now()-interval '1 minute'");assert.equal(await release(),0);assert.equal((await db.query('select live_status from service_requests')).rows[0].live_status,'EXPIRED');checks.push('Expired Live request stops wave');
const blockers=[];
await reset();await db.exec(`update businesses set latitude=-33.86,longitude=151.2;insert into service_areas values('${biz}',true,'Carlton','Melbourne','VIC')`);assert.equal(await release(),1);blockers.push('A Sydney provider with a Carlton named service area receives a 3 km Melbourne wave');
await reset();await db.exec("update business_availability set available_from=now()+interval '2 hours'");assert.equal(await release(),1);blockers.push('AVAILABLE_NOW with a future available_from is still notified');
await reset();await db.exec(`insert into business_members values('${biz}','${biz}','REMOVED');insert into service_dispatch_assignments values('${biz}',null)`);assert.equal(await release(),0);blockers.push('Unfinished assignment belonging to a removed member excludes the business');
await reset();await db.exec("update service_requests set delivery_mode='REMOTE';update services set delivery_mode='REMOTE';update businesses set latitude=-33.86,longitude=151.2");assert.equal(await release(),1);checks.push('Remote capability matching is global and bypasses geographic radius; remote map presentation needs product review');
const report={scope:'Disposable PostgreSQL; exact checked-in release_everest_live_wave, minimal table fixtures, no notification triggers or production permissions',checks,blockers};
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase5b-sql';await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/live-geography-audit.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await db.close();
