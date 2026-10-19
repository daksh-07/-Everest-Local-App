// Real PostgreSQL transactions/locks, exact repository functions, focused fixtures.
// Real payment-readiness and fee helper SQL; driver/membership dependencies remain controlled fixtures.
// This verifies transaction contracts, NOT Stripe, PostgREST, push or staging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {disposablePostgres} from './lib/phase6-postgres.mjs';
import {latestFunction} from './lib/phase6-sql-source.mjs';
const {db,connect}=await disposablePostgres();const tests=[],findings=[];
const customer='11111111-1111-4111-8111-111111111111',p1='22222222-2222-4222-8222-222222222222',p2='33333333-3333-4333-8333-333333333333',request='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',booking='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',quote='cccccccc-cccc-4ccc-8ccc-cccccccccccc',job='dddddddd-dddd-4ddd-8ddd-dddddddddddd',offer1='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',offer2='ffffffff-ffff-4fff-8fff-ffffffffffff';
async function check(name,run){try{await run();tests.push({name,pass:true});}catch(error){tests.push({name,pass:false,error:error.message});throw error;}}
async function as(id){const c=await connect();await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return c;}
async function response(c,id){return (await c.query("select respond_service_dispatch_offer($1,'ACCEPT') result",[id])).rows[0].result;}
try{
 await db.exec(`create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;
 create type booking_status as enum('REQUESTED','PENDING_PAYMENT','CONFIRMED','UPCOMING','IN_PROGRESS','COMPLETED','CANCELLED','DISPUTED');
 create type request_status as enum('OPEN','MATCHING','QUOTING','BOOKED','CANCELLED');
 create table service_requests(id uuid primary key,customer_id uuid,status request_status,service_id uuid,latitude numeric,longitude numeric,is_live boolean default true,live_status text default 'NOTIFYING',updated_at timestamptz);
 create table businesses(id uuid primary key,owner_id uuid,status text,verification_status text,stripe_connect_status text default 'ACTIVE',stripe_details_submitted boolean default true,stripe_charges_enabled boolean default true,stripe_payouts_enabled boolean default true,stripe_connected_account_id text default 'fixture_account');
 create table quotes(id uuid primary key,customer_id uuid,request_id uuid,business_id uuid,status text,total numeric,deposit numeric,proposed_date date,proposed_time time,valid_until timestamptz,updated_at timestamptz);
 create table bookings(id uuid primary key default gen_random_uuid(),request_id uuid,quote_id uuid,customer_id uuid,business_id uuid,price numeric,scheduled_date date,scheduled_time time,status booking_status,marketplace_payment_required boolean,created_at timestamptz default now(),completed_at timestamptz,updated_at timestamptz);
 create table opportunities(request_id uuid,status text,business_id uuid,is_live boolean default true,responded_at timestamptz);
 create table notifications(user_id uuid,kind text,title text,body text,data jsonb);
 create table service_dispatch_jobs(id uuid primary key,request_id uuid,status text,claimed_provider_id uuid,scheduled_start_at timestamptz,estimated_duration_minutes integer,claimed_at timestamptz,updated_at timestamptz);
 create table service_dispatch_offers(id uuid primary key,job_id uuid,provider_id uuid,status text,expires_at timestamptz,responded_at timestamptz);
 create table service_dispatch_assignments(id uuid primary key default gen_random_uuid(),job_id uuid unique,service_request_id uuid,booking_id uuid,provider_id uuid,scheduled_start_at timestamptz,scheduled_end_at timestamptz,completed_at timestamptz);
 create unique index provider_one_active on service_dispatch_assignments(provider_id) where completed_at is null;
 create table driver_availability(driver_id uuid,status text,service_radius_km numeric);
 create table service_provider_locations(provider_id uuid,latitude numeric,longitude numeric,recorded_at timestamptz);
 create table service_provider_capabilities(provider_id uuid,service_id uuid);
 create table service_dispatch_config(id boolean,location_freshness_seconds integer);insert into service_dispatch_config values(true,600);
 create table delivery_assignments(driver_id uuid,accepted_at timestamptz,completed_at timestamptz);
 create table audit_logs(actor_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
 create table service_payments(booking_id uuid,amount numeric,status text,provider_checkout_session_id text);
 create function dispatch_driver_is_operational(uuid) returns boolean language sql as $$select true$$;
 create function dispatch_next_service_provider(uuid) returns uuid language sql as $$select null::uuid$$;
 create function everest_live_audit(uuid,text,jsonb default '{}'::jsonb) returns void language sql as $$select$$;
 create function is_business_payment_ready(uuid) returns boolean language sql as $$select true$$;
 create function calculate_service_platform_fee(numeric) returns numeric language sql as $$select 0::numeric$$;
 create function is_admin() returns boolean language sql as $$select false$$;
 create function can_operate_business_booking(p_id uuid) returns boolean language sql security definer as $$select exists(select 1 from bookings b join businesses biz on biz.id=b.business_id where b.id=p_id and biz.owner_id=auth.uid())$$;`);
 for(const name of ['is_business_payment_ready','calculate_service_platform_fee'])await db.exec((await latestFunction(name)).sql);
 const sources={};for(const name of ['respond_service_dispatch_offer','accept_quote','cancel_everest_live','update_booking_status']){const source=await latestFunction(name);sources[name]=source.file;await db.exec(source.sql);await db.exec(`revoke all on function public.${name}(${name==='respond_service_dispatch_offer'?'uuid,text':name==='update_booking_status'?'uuid,booking_status':'uuid'}) from public,anon;grant execute on function public.${name}(${name==='respond_service_dispatch_offer'?'uuid,text':name==='update_booking_status'?'uuid,booking_status':'uuid'}) to authenticated;`);}
 // Include the actual Live triggers: without the BEFORE request lifecycle
 // trigger a fixture would incorrectly allow cancellation after booking.
 for(const name of ['sync_everest_live_request_lifecycle','everest_live_quote_response','cancel_service_dispatch_on_marketplace_change'])await db.exec((await latestFunction(name)).sql);
 await db.exec(`create trigger live_request_lifecycle before update of status on service_requests for each row execute function sync_everest_live_request_lifecycle();
 create trigger live_quote_response after insert or update of status on quotes for each row execute function everest_live_quote_response();
 create trigger dispatch_request_lifecycle after update of status on service_requests for each row execute function cancel_service_dispatch_on_marketplace_change();
 create trigger dispatch_booking_lifecycle after update of status on bookings for each row execute function cancel_service_dispatch_on_marketplace_change();`);
 async function reset(){await db.exec(`truncate service_requests,businesses,quotes,bookings,opportunities,service_dispatch_jobs,service_dispatch_offers,service_dispatch_assignments,driver_availability,service_provider_locations,service_provider_capabilities,delivery_assignments,notifications,audit_logs;
 insert into businesses(id,owner_id,status,verification_status) values('${p1}','${p1}','ACTIVE','VERIFIED'),('${p2}','${p2}','ACTIVE','VERIFIED');
 insert into service_requests(id,customer_id,status,service_id,latitude,longitude) values('${request}','${customer}','BOOKED','${request}',-37.8,144.96);
 insert into quotes(id,customer_id,request_id,business_id,status,total,deposit) values('${quote}','${customer}','${request}','${p1}','ACCEPTED',100,0);
 insert into bookings(id,request_id,quote_id,customer_id,business_id,price,status,marketplace_payment_required) values('${booking}','${request}','${quote}','${customer}','${p1}',100,'CONFIRMED',false);
 insert into service_dispatch_jobs(id,request_id,status) values('${job}','${request}','PROVIDER_OFFERED');
 insert into service_dispatch_offers(id,job_id,provider_id,status,expires_at) values('${offer1}','${job}','${p1}','OFFERED',now()+interval '10 minutes'),('${offer2}','${job}','${p2}','OFFERED',now()+interval '10 minutes');
 insert into driver_availability values('${p1}','ONLINE',10),('${p2}','ONLINE',10);
 insert into service_provider_locations values('${p1}',-37.801,144.961,now()),('${p2}',-37.802,144.962,now());
 insert into service_provider_capabilities values('${p1}','${request}'),('${p2}','${request}');`);}
 const c1=await as(p1),c2=await as(p2),cc=await as(customer);
 await check('two providers concurrently accept: exactly one committed assignment',async()=>{await reset();const results=await Promise.all([response(c1,offer1),response(c2,offer2)]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.code==='JOB_ALREADY_ASSIGNED').length,1);assert.equal((await db.query('select * from service_dispatch_assignments')).rowCount,1);assert.equal((await db.query("select status from service_dispatch_jobs")).rows[0].status,'ASSIGNED');});
 await check('repeat acceptance after lost response cannot create duplicate assignment',async()=>{const result=await response(c1,offer1);assert.equal(result.ok,false);assert.equal((await db.query('select * from service_dispatch_assignments')).rowCount,1);});
 for(const [name,setup,code] of [
  ['stale offer',"update service_dispatch_offers set expires_at=now()-interval '1 second'",'OFFER_NO_LONGER_AVAILABLE'],
  ['offline provider',"update driver_availability set status='OFFLINE'",'PROVIDER_NOT_ONLINE'],
  ['stale location',"update service_provider_locations set recorded_at=now()-interval '1 hour'",'LOCATION_STALE'],
  ['cancelled request',"update service_requests set status='CANCELLED'",'OFFER_NO_LONGER_AVAILABLE'],
  ['missing capability','truncate service_provider_capabilities','PROVIDER_NOT_CAPABLE'],
  ['outside provider radius','update driver_availability set service_radius_km=0.01','PROVIDER_OUTSIDE_SERVICE_RADIUS']]){
  await check(name+' cannot create an assignment',async()=>{await reset();await db.exec(setup);assert.equal((await response(c1,offer1)).code,code);assert.equal((await db.query('select * from service_dispatch_assignments')).rowCount,0);});
 }
 await check('another account cannot accept a provider offer',async()=>{await reset();await assert.rejects(response(c2,offer1),/Not authorized/);assert.equal((await db.query('select * from service_dispatch_assignments')).rowCount,0);});
 await check('completion progresses through allowed states and is authorized',async()=>{await reset();for(const next of ['UPCOMING','IN_PROGRESS','COMPLETED'])await c1.query('select update_booking_status($1,$2)',[booking,next]);assert.equal((await db.query('select status,completed_at is not null completed from bookings')).rows[0].completed,true);await assert.rejects(c2.query("select update_booking_status($1,'COMPLETED')",[booking]),/Not authorized/);await assert.rejects(c1.query("select update_booking_status($1,'COMPLETED')",[booking]),/Invalid booking transition/);});
 await check('customer cancellation expires offers and is not repeat-success',async()=>{await reset();await db.exec("update service_requests set status='QUOTING';insert into opportunities(request_id,status) values('"+request+"','OPEN')");assert.equal((await cc.query('select cancel_everest_live($1) result',[request])).rows[0].result,true);assert.equal((await db.query('select status from opportunities')).rows[0].status,'EXPIRED');assert.equal((await cc.query('select cancel_everest_live($1) result',[request])).rows[0].result,false);});
 await check('provider cannot cancel customer request',async()=>{await reset();assert.equal((await c1.query('select cancel_everest_live($1) result',[request])).rows[0].result,false);});
 // Acceptance is a customer decision, distinct from provider dispatch acceptance.
 async function prepareQuotes(){await reset();await db.exec(`truncate bookings;update service_requests set status='QUOTING';update quotes set status='SENT';insert into quotes(id,customer_id,request_id,business_id,status,total,deposit) values('${offer2}','${customer}','${request}','${p2}','SENT',100,0)`);}
 async function waitForLocks(clients){const deadline=Date.now()+5000;let waiting=0;while(Date.now()<deadline){waiting=Number((await db.query("select count(*) n from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'",[clients.map(c=>c.processID)])).rows[0].n);if(waiting===clients.length)return;await new Promise(r=>setTimeout(r,10));}assert.equal(waiting,clients.length,'API calls reached the controlled request gate');}
 async function decision(client,id){try{return {value:(await client.query('select accept_quote($1) result',[id])).rows[0].result};}catch(error){return {code:error.code,message:error.message};}}
 async function raceQuotes(same=false){
  await prepareQuotes();const cc2=await as(customer),gate=await connect();await gate.query('begin');await gate.query('select id from service_requests where id=$1 for update',[request]);
  const first=decision(cc,quote),second=decision(cc2,same?quote:offer2);
  try{await waitForLocks([cc,cc2]);}finally{await gate.query('commit');}
  const result=await Promise.all([first,second]);
  assert.equal((await db.query('select * from bookings')).rowCount,1);assert.equal(result.filter(r=>r.value).length,1);assert.equal(result.some(r=>r.code==='40P01'),false,'customer acceptance must not deadlock');
  assert.match(result.find(r=>r.code)?.message??'',/no longer accepting/);
  await cc2.end();await gate.end();return result;
 }
 await check('simultaneous customer quote decisions have no deadlock and exactly one booking (20 gated races)',async()=>{for(let i=0;i<20;i++)await raceQuotes();});
 await check('same quote duplicate acceptance serializes without duplicate booking or deadlock (10 races)',async()=>{for(let i=0;i<10;i++)await raceQuotes(true);});
 await check('winner preserves pending payment, price, fee deposit and request/quote invariants',async()=>{
  const b=(await db.query('select * from bookings')).rows[0];assert.equal(b.status,'PENDING_PAYMENT');assert.equal(b.marketplace_payment_required,true);assert.equal(Number(b.price),100);
  assert.equal((await db.query('select status from service_requests')).rows[0].status,'BOOKED');
  const qs=(await db.query('select * from quotes')).rows;assert.equal(qs.filter(q=>q.status==='ACCEPTED').length,1);assert.equal(qs.filter(q=>q.status==='DECLINED').length,1);assert.equal(Number(qs.find(q=>q.status==='ACCEPTED').deposit),5);
 });
 await check('cancel versus quote acceptance preserves mutually exclusive state (20 races)',async()=>{for(let i=0;i<20;i++){
  await prepareQuotes();const other=await as(customer);const [a,c]=await Promise.all([decision(cc,quote),other.query('select cancel_everest_live($1) result',[request])]);
  await other.end();assert.notEqual(a.code,'40P01');const count=(await db.query('select * from bookings')).rowCount;assert.equal(count,c.rows[0].result?0:1);assert.equal((await db.query('select status from service_requests')).rows[0].status,count?'BOOKED':'CANCELLED');
 }});
 await check('lost response after commit is recoverable by authoritative request booking read',async()=>{await prepareQuotes();await cc.query('select accept_quote($1)',[quote]);const row=(await db.query('select id,status from bookings where request_id=$1',[request])).rows[0];assert.ok(row.id);assert.equal(row.status,'PENDING_PAYMENT');await assert.rejects(cc.query('select accept_quote($1)',[quote]),/no longer accepting/);assert.equal((await db.query('select * from bookings')).rowCount,1);});
 await check('lock timeout rolls back completely; explicit later decision remains valid',async()=>{
  await prepareQuotes();const gate=await connect();await gate.query('begin');await gate.query('select id from service_requests where id=$1 for update',[request]);await cc.query("set statement_timeout='80ms'");
  try{const result=await decision(cc,quote);assert.equal(result.code,'57014');assert.equal((await db.query('select * from bookings')).rowCount,0);}finally{await cc.query('reset statement_timeout');await gate.query('rollback');}
  assert.ok((await decision(cc,quote)).value);assert.equal((await db.query('select * from bookings')).rowCount,1);
 });
 await check('disconnect before commit rolls back booking, quote and request changes',async()=>{await prepareQuotes();const client=await as(customer);await client.query('begin');await client.query('select accept_quote($1)',[quote]);await client.end();assert.equal((await db.query('select * from bookings')).rowCount,0);assert.equal((await db.query('select status from quotes where id=$1',[quote])).rows[0].status,'SENT');assert.equal((await db.query('select status from service_requests')).rows[0].status,'QUOTING');});
 for(const [name,sql] of [['quote owner',`update quotes set customer_id='${p1}' where id='${quote}'`],['quote request',`insert into service_requests(id,customer_id,status) values('${offer1}','${customer}','QUOTING');update quotes set request_id='${offer1}' where id='${quote}'`]])await check(name+' changed during wait is revalidated under lock',async()=>{
  await prepareQuotes();const gate=await connect();await gate.query('begin');await gate.query('select id from service_requests where id=$1 for update',[request]);const pending=decision(cc,quote);
  try{await waitForLocks([cc]);await db.exec(sql);}finally{await gate.query('commit');}const result=await pending;assert.match(result.message,/Not authorized/);assert.equal((await db.query('select * from bookings')).rowCount,0);
 });
 for(const [name,setup] of [['unverified provider',"update businesses set verification_status='PENDING'"],['inactive provider',"update businesses set status='INACTIVE'"],['payment readiness disabled',"update businesses set stripe_payouts_enabled=false"]])await check(name+' cannot bypass payment readiness',async()=>{await prepareQuotes();await db.exec(setup);await assert.rejects(cc.query('select accept_quote($1)',[quote]),/not ready to receive/);assert.equal((await db.query('select * from bookings')).rowCount,0);assert.equal((await db.query('select status from quotes where id=$1',[quote])).rows[0].status,'SENT');});
 await check('anonymous execute and direct authenticated quote writes remain denied',async()=>{const guest=await connect();await guest.query('set role anon');await assert.rejects(guest.query('select accept_quote($1)',[quote]),e=>e.code==='42501');await assert.rejects(cc.query("update quotes set status='ACCEPTED' where id=$1",[quote]),e=>e.code==='42501');});
 await check('missing session cannot invoke customer acceptance',async()=>{const missing=await as('');await assert.rejects(missing.query('select accept_quote($1)',[quote]),/Authentication required/);});
 await check('expired quote rejects without booking',async()=>{await reset();await db.exec("truncate bookings;update service_requests set status='QUOTING';update quotes set status='SENT',valid_until=now()-interval '1 minute'");await assert.rejects(cc.query('select accept_quote($1)',[quote]),/Quote expired/);assert.equal((await db.query('select * from bookings')).rowCount,0);});
 await check('cancelled request rejects quote acceptance',async()=>{await reset();await db.exec("truncate bookings;update service_requests set status='CANCELLED';update quotes set status='SENT'");await assert.rejects(cc.query('select accept_quote($1)',[quote]),/no longer accepting/);assert.equal((await db.query('select * from bookings')).rowCount,0);});
 await check('provider cannot accept a customer quote',async()=>{await reset();await assert.rejects(c1.query('select accept_quote($1)',[quote]),/Not authorized/);});
 for(const [name,expected] of Object.entries({update_booking_status:'56205fe1754f88e377540864ffbf18e4'}))await check(name+' matches read-only production function fingerprint',async()=>{const row=(await db.query("select md5(pg_get_functiondef(p.oid)) fingerprint from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name])).rows[0];assert.equal(row.fingerprint,expected);});
 await check('accept_quote financial, state, notification and booking tail is byte-identical to production baseline',async()=>{
  const baseline=await fs.readFile('supabase/migrations/20260929140000_harden_marketplace_quote_payment_readiness.sql','utf8');
  const original=baseline.slice(baseline.indexOf('create or replace function public.accept_quote('));
  const current=(await latestFunction('accept_quote')).sql;
  const tail=sql=>sql.slice(sql.indexOf("  if r.status<>'QUOTING'")).split('$$;')[0];
  assert.equal(tail(current),tail(original));
 });
 await check('provider acceptance matches production SQL body tokens despite formatting',async()=>{const {sql}=await latestFunction('respond_service_dispatch_offer');const body=sql.match(/\bas\s+(\$\w*\$)([\s\S]*?)\1/i)[2];const tokens=body.match(/'(?:''|[^'])*'|\w+|<>|>=|<=|:=|::|[^\s]/g);assert.equal(createHash('sha256').update(tokens.join('\x1f')).digest('hex'),'a6f07ca9fec1d5000fb821905a11cf80db5ea2e4ff1cf81ecfc484afe7824ec8');});
 tests.push({name:'exact function source provenance',pass:true,sources});
}finally{
 const report={scope:'PostgreSQL 17.6 loopback; independent transactions, synthetic request/confirmed-booking fixtures and real fee/readiness SQL and controlled driver/membership helpers. Not full schema, staging, Stripe or realtime.',tests,findings,passed:tests.filter(t=>t.pass).length,failed:tests.filter(t=>!t.pass).length};const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase6-transactions';await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/transactions.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await db.close();
}
