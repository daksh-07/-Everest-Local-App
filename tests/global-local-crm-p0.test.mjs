import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260925173000_global_local_crm_p0.sql');
const customers=read('app/business-customers.tsx');
const customer=read('app/business-customer.tsx');
const availability=read('app/business-availability.tsx');
const home=read('app/index.tsx');
const location=read('lib/customer-location.ts');
const tab=read('components/BusinessTabBar.tsx');

test('global locality does not persist precise coordinates on the profile',()=>{
 assert.match(location,/getCurrentPositionAsync/);
 assert.match(location,/reverseGeocodeAsync/);
 assert.match(location,/p_suburb:locality\.suburb/);
 assert.match(location,/p_country:locality\.country/);
 const save=location.slice(location.indexOf('export async function saveLocalityToProfile'));
 assert.doesNotMatch(save,/latitude:locality|longitude:locality|accuracy:locality/);
 assert.doesNotMatch(home,/['"]Sydney['"]|['"]NSW['"]/);
});

test('business availability is authoritative and membership-gated',()=>{
 assert.match(migration,/create table if not exists public\.business_availability/);
 assert.match(migration,/AVAILABLE_NOW.*AVAILABLE_LATER.*BUSY.*OFFLINE/s);
 assert.match(migration,/set_business_availability/);
 assert.match(migration,/not public\.is_business_member\(p_business_id\)/);
 assert.match(availability,/AVAILABLE_NOW|Ready for new work now/);
 assert.match(availability,/Matching still applies verification, capability, location and marketplace eligibility/);
});

test('CRM private tables are tenant isolated by business membership',()=>{
 for(const table of ['business_contacts','crm_activities','crm_notes','crm_tasks','crm_external_quotes','crm_external_quote_items','crm_external_bookings']){
  assert.match(migration,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(migration,new RegExp('create policy '+table.replace('business_contacts','business_contacts').replace('crm_activities','crm_activities').replace('crm_notes','crm_notes').replace('crm_tasks','crm_tasks').replace('crm_external_quotes','crm_external_quotes').replace('crm_external_quote_items','crm_external_quote_items').replace('crm_external_bookings','crm_external_bookings')+'_member_all'));
 }
 const policyMatches=migration.match(/public\.is_business_member\(business_id\)/g)??[];
 assert.ok(policyMatches.length>=8);
 assert.doesNotMatch(migration,/to authenticated\s+using \(true\)/i);
});

test('forged business ids and private CRM exposure are blocked',()=>{
 assert.match(migration,/create_business_contact[\s\S]*not public\.is_business_member\(p_business_id\)/);
 assert.match(migration,/revoke all on public\.business_contacts[\s\S]*from authenticated/);
 assert.match(migration,/grant select,insert,update,delete on public\.business_contacts/);
 assert.doesNotMatch(home,/business_contacts|crm_notes|crm_tasks|estimated_value|lead_status/);
});

test('duplicate detection warns and does not silently merge',()=>{
 assert.match(migration,/find_business_contact_duplicates/);
 assert.doesNotMatch(migration,/merge_business_contacts|on conflict.*email|on conflict.*phone/i);
 assert.match(customers,/Possible duplicate customer/);
 assert.match(customers,/Review before creating another record/);
});

test('CRM customer 360 includes notes tasks pipeline and linked authoritative marketplace records',()=>{
 assert.match(customer,/CUSTOMER 360/);
 assert.match(customer,/crm_notes/);
 assert.match(customer,/crm_tasks/);
 assert.match(customer,/crm_activities/);
 assert.match(customer,/crm_external_quotes/);
 assert.match(customer,/crm_external_bookings/);
 assert.match(customer,/from\('bookings'\).*customer_id/s);
 assert.match(customer,/from\('quotes'\).*customer_id/s);
 assert.match(customer,/Recorded completed revenue/);
 assert.match(tab,/Customers/);
});

test('verified completed-work provenance cannot be directly forged by authenticated clients',()=>{
 assert.match(migration,/verified_work_post_links/);
 assert.match(migration,/verified_work_posts/);
 assert.match(migration,/publish_verified_work_post/);
 assert.match(migration,/where id=p_booking_id and status='COMPLETED'/);
 assert.match(migration,/b\.customer_id<>auth\.uid\(\) and not public\.is_business_member\(b\.business_id\)/);
 assert.match(migration,/revoke all on public\.[^;]*verified_work_post_links[^;]*from authenticated/s);
 assert.doesNotMatch(migration,/grant insert[^;]*verified_work_posts[^;]*authenticated/i);
});

test('external CRM quote and booking foundations stay separate from native marketplace lifecycle',()=>{
 assert.match(migration,/create table if not exists public\.crm_external_quotes/);
 assert.match(migration,/create table if not exists public\.crm_external_bookings/);
 assert.doesNotMatch(migration,/alter table public\.quotes|alter table public\.bookings/);
 assert.match(customer,/CREATE DRAFT QUOTE/);
 assert.match(customer,/ADD BOOKING/);
});
