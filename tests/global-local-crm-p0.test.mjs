import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260925173000_global_local_crm_p0.sql');
const v2=read('supabase/migrations/20260925203000_professional_crm_v2.sql');
const customers=read('app/business-customers.tsx');
const customer=read('app/business-customer.tsx');
const availability=read('app/business-availability.tsx');
const home=read('app/index.tsx');
const location=read('lib/customer-location.ts');
const tab=read('components/BusinessTabBar.tsx');

test('global locality does not persist precise coordinates on the profile',()=>{
 assert.match(location,/getCurrentPositionAsync/);assert.match(location,/reverseGeocodeAsync/);assert.match(location,/p_suburb:locality\.suburb/);assert.match(location,/p_country:locality\.country/);
 const save=location.slice(location.indexOf('export async function saveLocalityToProfile'));assert.doesNotMatch(save,/latitude:locality|longitude:locality|accuracy:locality/);assert.doesNotMatch(home,/['"]Sydney['"]|['"]NSW['"]/);
});

test('business availability is authoritative and membership-gated',()=>{
 assert.match(migration,/create table if not exists public\.business_availability/);assert.match(migration,/AVAILABLE_NOW.*AVAILABLE_LATER.*BUSY.*OFFLINE/s);assert.match(migration,/set_business_availability/);assert.match(migration,/not public\.is_business_member\(p_business_id\)/);assert.match(availability,/AVAILABLE_NOW|Ready for new work now/);
});

test('P0 CRM private tables remain tenant isolated by business membership',()=>{
 for(const table of ['business_contacts','crm_activities','crm_notes','crm_tasks','crm_external_quotes','crm_external_quote_items','crm_external_bookings']){assert.match(migration,new RegExp('alter table public\\.'+table+' enable row level security'));assert.match(migration,new RegExp('create policy '+table+'_member_all'));}
 assert.ok((migration.match(/public\.is_business_member\(business_id\)/g)??[]).length>=8);assert.doesNotMatch(migration,/to authenticated\s+using \(true\)/i);
});

test('forged business ids and private CRM exposure are blocked',()=>{
 assert.match(migration,/create_business_contact[\s\S]*not public\.is_business_member\(p_business_id\)/);assert.match(migration,/revoke all on public\.business_contacts[\s\S]*from authenticated/);assert.doesNotMatch(home,/business_contacts|crm_notes|crm_tasks|estimated_value|lead_status/);
});

test('duplicate detection warns and does not silently merge',()=>{
 assert.match(migration,/find_business_contact_duplicates/);assert.match(customers,/Possible duplicate/);assert.match(customers,/never merge ambiguous contacts automatically/);assert.match(customers,/KEEP SEPARATE ANYWAY/);assert.match(v2,/crm_merge_contacts/);
});

test('Customer 360 is tabbed and separates contacts from sales objects',()=>{
 assert.match(customer,/CUSTOMER 360/);for(const label of ['OVERVIEW','TIMELINE','DEALS','QUOTES','BOOKINGS','PAYMENTS','NOTES','TASKS'])assert.match(customer,new RegExp(label));
 assert.match(customer,/listCrmOpportunities/);assert.match(customer,/listCrmQuotes/);assert.match(customer,/listCrmBookings/);assert.match(customer,/crm_notes/);assert.match(customer,/from\('bookings'\).*customer_id/s);assert.match(customer,/from\('quotes'\).*customer_id/s);
 assert.match(tab,/CRM/);assert.match(tab,/Calendar/);
});

test('verified completed-work provenance cannot be directly forged by authenticated clients',()=>{
 assert.match(migration,/verified_work_post_links/);assert.match(migration,/verified_work_posts/);assert.match(migration,/publish_verified_work_post/);assert.match(migration,/where id=p_booking_id and status='COMPLETED'/);assert.match(migration,/b\.customer_id<>auth\.uid\(\) and not public\.is_business_member\(b\.business_id\)/);assert.match(migration,/revoke all on public\.[^;]*verified_work_post_links[^;]*from authenticated/s);
});

test('legacy external CRM records stay preservable while professional records remain separate from marketplace tables',()=>{
 assert.match(migration,/create table if not exists public\.crm_external_quotes/);assert.match(migration,/create table if not exists public\.crm_external_bookings/);assert.match(v2,/legacy_external_quote_id/);assert.match(v2,/legacy_external_booking_id/);assert.match(v2,/linked_marketplace_quote_id/);assert.match(v2,/linked_marketplace_booking_id/);
});
