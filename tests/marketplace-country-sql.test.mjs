import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
const {db}=process.env.PHASE6_DATABASE_URL?await(await import('../scripts/lib/phase6-postgres.mjs')).disposablePostgres():{db:new(await import('@electric-sql/pglite')).PGlite()};
const files=await fs.readdir('supabase/migrations'),file=files.find(n=>n.endsWith('_marketplace_country_matching_guard.sql'));
function extract(source,name){const start=source.indexOf('create or replace function public.'+name+'(');assert.ok(start>=0,name);const body=source.indexOf('$$',start);return source.slice(start,source.indexOf('$$;',body+2)+3)}
await db.exec(await fs.readFile('tests/fixtures/marketplace-country-schema.sql','utf8'));
const old=await fs.readFile('supabase/migrations/20260926121806_structured_service_niche_matching.sql','utf8'),regular=await fs.readFile('supabase/migrations/20260925053936_request_posts_matching_ux.sql','utf8'),live=await fs.readFile('supabase/migrations/20261019035613_phase6_live_request_quote_lifecycle.sql','utf8');
await db.exec(extract(await fs.readFile('supabase/migrations/20260926112442_everest_live_marketplace.sql','utf8'),'everest_distance_km'));
await db.exec(extract(old,'match_service_request'));await db.exec(extract(regular,'release_service_request_wave'));await db.exec(extract(live,'release_everest_live_wave'));
const customer='11111111-1111-4111-8111-111111111111',business='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333';
async function reset(country='Canada',provider='Canada'){
 await db.exec('truncate orders,order_items,products,service_requests,businesses,services,service_areas,business_availability,business_members,driver_availability,service_provider_locations,service_dispatch_assignments,service_matches,opportunities,quotes,bookings,notifications');
 await db.query('select set_config($1,$2,false)',['test.uid',customer]);
 await db.query("insert into businesses(id,owner_id,status,verification_status,accepts_requests,country,latitude,longitude) values($1,$2,'ACTIVE','VERIFIED',true,$3,43.65,-79.38)",[business,customer,provider]);
 await db.query("insert into service_requests(id,customer_id,country,suburb,city,state,latitude,longitude) values($1,$2,$3,'Richmond','Richmond','Shared',43.65,-79.38)",[request,customer,country]);
 await db.query("insert into services(id,business_id,active,delivery_mode) values($1,$1,true,'LOCAL')",[business]);
 await db.query("insert into service_areas(business_id,active,suburb,city,state) values($1,true,'Richmond','Richmond','Shared')",[business]);
 await db.query("insert into business_availability(business_id,status) values($1,'AVAILABLE_NOW')",[business]);
}
const count=async(sql,params=[request])=>(await db.query(sql,params)).rows[0].n;
await reset('Canada','Australia');const beforeStandard=await count('select match_service_request($1) n');await reset('Canada','Australia');const beforeLive=await count('select release_everest_live_wave($1,3,1) n');
await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
test.after(async()=>await db.close());
test('baseline actually offers a same-named locality across countries before the correction',()=>{assert.equal(beforeStandard,1);assert.equal(beforeLive,1)});
test('standard matching excludes foreign and missing countries before notifications',async()=>{
 for(const [a,b] of [['Canada','Australia'],['India','Australia'],['','Canada'],['Canada',null],['CA / US','CA / US']]){await reset(a,b);assert.equal(await count('select match_service_request($1) n'),0);assert.equal(await count('select count(*)::integer n from opportunities',[]),0);assert.equal(await count('select count(*)::integer n from notifications',[]),0);}
});
test('same country and known aliases remain eligible without changing service capability',async()=>{
 for(const [a,b] of [[' Canada ','canada'],['CA','Canada'],['Australia','AU'],['India','IN'],['New Zealand','NZ'],['United Kingdom','GB']]){await reset(a,b);assert.equal(await count('select match_service_request($1) n'),1);}
 await reset();await db.exec("update services set active=false");assert.equal(await count('select match_service_request($1) n'),0);
});
test('legacy cached matches cannot release foreign opportunities',async()=>{
 await reset('Canada','Australia');await db.exec("update service_requests set status='MATCHING'");await db.query('insert into service_matches(request_id,business_id,score) values($1,$2,100)',[request,business]);assert.equal(await count('select release_service_request_wave($1,5) n'),0);
});
test('Live retains availability, radius and repeat-wave gates alongside country',async()=>{
 await reset('Canada','Australia');assert.equal(await count('select release_everest_live_wave($1,3,1) n'),0);
 await reset('CA','Canada');assert.equal(await count('select release_everest_live_wave($1,3,1) n'),1);assert.equal(await count('select release_everest_live_wave($1,3,1) n'),0);
 await reset();await db.exec("update business_availability set status='OFFLINE'");assert.equal(await count('select release_everest_live_wave($1,3,1) n'),0);
 await reset();await db.exec('update businesses set latitude=10');assert.equal(await count('select release_everest_live_wave($1,3,1) n'),0);
});
test('write guards reject cross-country opportunity, quote and booking creation atomically',async()=>{
 for(const table of ['opportunities','quotes','bookings']){await reset('Canada','Australia');await assert.rejects(db.query(`insert into ${table}(request_id,business_id) values($1,$2)`,[request,business]),/cannot take local requests/);assert.equal(await count(`select count(*)::integer n from ${table}`,[]),0);}
});
test('quote/booking identity reassignment is rechecked without invalidating paid-job status changes',async()=>{
 await reset();await db.query('insert into bookings(request_id,business_id) values($1,$2)',[request,business]);await db.exec("update service_requests set country='Australia'");await db.exec("update bookings set status='COMPLETED'");assert.equal((await db.query('select status from bookings')).rows[0].status,'COMPLETED');await assert.rejects(db.exec('update bookings set business_id=business_id'),/cannot take local requests/);
});
test('explicit remote services retain capability matching without a geographic promise',async()=>{
 await reset('Canada','Australia');await db.exec("update service_requests set delivery_mode='REMOTE';update services set delivery_mode='REMOTE'");assert.equal(await count('select match_service_request($1) n'),1);await db.query('insert into quotes(request_id,business_id) values($1,$2)',[request,business]);
});
test('country helpers and trigger implementation are not new public RPC endpoints',async()=>{
 for(const role of ['anon','authenticated'])for(const fn of ['private.marketplace_country_key(text)','private.marketplace_countries_match(text,text)','private.guard_marketplace_country()','private.guard_order_fulfilment_country()','private.guard_order_destination_snapshot()'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
});

test('scoped opportunity listing hides stale foreign matches and still requires business membership',async()=>{
 await reset();await db.query('insert into opportunities(request_id,business_id) values($1,$2)',[request,business]);assert.equal((await db.query("select * from list_my_business_opportunities($1,'OPEN')",[business])).rows.length,1);await db.exec("update businesses set country='Australia'");assert.equal((await db.query("select * from list_my_business_opportunities($1,'OPEN')",[business])).rows.length,0);await db.exec("update businesses set country='Canada'");await db.query("select set_config('test.uid',$1,false)",['44444444-4444-4444-8444-444444444444']);assert.equal((await db.query("select * from list_my_business_opportunities($1,'OPEN')",[business])).rows.length,0);
});
test('manual legacy rows without request retain existing lifecycle and authorisation contracts',async()=>{await reset();await db.query('insert into bookings(request_id,business_id) values(null,$1)',[business]);assert.equal(await count('select count(*)::integer n from bookings',[]),1)});

test('product fulfilment requires an explicit same-country destination before an order line exists',async()=>{
 for(const method of ['SHIPPING','EVEREST_DELIVERY','SAME_DAY'])for(const country of ['Australia',null,'','CA / US']){
  await reset();await db.query('insert into products(id,business_id) values($1,$1)',[business]);const order=(await db.query('insert into orders(business_id,delivery_method,delivery_address) values($1,$2,$3) returning id',[business,method,JSON.stringify({address_line:'Synthetic test address',country})])).rows[0].id;
  await assert.rejects(db.query('insert into order_items values($1,$2,1)',[order,business]),/MARKETPLACE_(CROSS_BORDER_UNSUPPORTED|DESTINATION_REQUIRED)/);assert.equal(await count('select count(*)::integer n from order_items',[]),0);
 }
});
test('domestic delivery/shipping and explicit pickup retain supported merchant methods',async()=>{
 for(const method of ['PICKUP','SHIPPING','EVEREST_DELIVERY','SAME_DAY']){
  await reset();await db.query('insert into products(id,business_id) values($1,$1)',[business]);const order=(await db.query('insert into orders(business_id,delivery_method,delivery_address) values($1,$2,$3) returning id',[business,method,JSON.stringify({address_line:'Synthetic test address',country:'CA'})])).rows[0].id;await db.query('insert into order_items values($1,$2,1)',[order,business]);assert.equal(await count('select count(*)::integer n from order_items',[]),1);
 }
});
test('unknown origin, paused merchant and unsupported shipping fail closed',async()=>{
 for(const setup of ["update businesses set country=null","update businesses set status='PAUSED'","update businesses set accepts_orders=false","update products set shipping_available=false"]){
  await reset();await db.query('insert into products(id,business_id) values($1,$1)',[business]);const order=(await db.query("insert into orders(business_id,delivery_method,delivery_address) values($1,'SHIPPING',$2) returning id",[business,JSON.stringify({country:'Canada'})])).rows[0].id;await db.exec(setup);await assert.rejects(db.query('insert into order_items values($1,$2,1)',[order,business]),/MARKETPLACE_(FULFILMENT_UNKNOWN|PRODUCT_UNAVAILABLE)/);
 }
});

test('checkout destination cannot be changed underneath an existing order snapshot',async()=>{
 await reset();await db.query('insert into products(id,business_id) values($1,$1)',[business]);const order=(await db.query("insert into orders(business_id,delivery_method,delivery_address) values($1,'SHIPPING',$2) returning id",[business,JSON.stringify({country:'Canada'})])).rows[0].id;await db.query('insert into order_items values($1,$2,1)',[order,business]);await assert.rejects(db.query('update orders set delivery_address=$1 where id=$2',[JSON.stringify({country:'Australia'}),order]),/MARKETPLACE_DESTINATION_IMMUTABLE/);assert.equal((await db.query('select delivery_address from orders')).rows[0].delivery_address.country,'Canada');
});
