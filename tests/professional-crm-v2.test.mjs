import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260925203000_professional_crm_v2.sql');
const crm=read('lib/crm.ts');
const command=read('app/business-crm.tsx');
const contacts=read('app/business-customers.tsx');
const customer=read('app/business-customer.tsx');
const deal=read('app/business-deal.tsx');
const quote=read('app/business-crm-quote.tsx');
const booking=read('app/business-crm-booking.tsx');
const calendar=read('app/business-calendar.tsx');
const today=read('app/business-today.tsx');
const tabs=read('components/BusinessTabBar.tsx');

const tables=['crm_pipelines','crm_pipeline_stages','crm_opportunities','crm_tags','crm_contact_tags','crm_quotes','crm_quote_items','crm_bookings','crm_calendar_blocks'];
test('professional CRM tables are tenant isolated and anon is revoked',()=>{
 for(const table of tables){
  assert.match(migration,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(migration,new RegExp('create policy '+table+'_member_all[\\s\\S]*public\\.is_business_member\\(business_id\\)'));
  assert.match(migration,new RegExp('revoke all on public\\.'+table+' from anon'));
 }
 assert.doesNotMatch(migration,/create policy crm_[\s\S]{0,200}using \(true\)/i);
});

test('contact, opportunity, quote and booking relationships enforce the same business tenant',()=>{
 for(const fragment of [
  'foreign key (contact_id,business_id) references public.business_contacts(id,business_id)',
  'foreign key (pipeline_id,business_id) references public.crm_pipelines(id,business_id)',
  'foreign key (stage_id,business_id) references public.crm_pipeline_stages(id,business_id)',
  'foreign key (quote_id,business_id) references public.crm_quotes(id,business_id)'
 ])assert.match(migration,new RegExp(fragment.replace(/[()]/g,'\\$&')));
 assert.match(migration,/crm_tasks_opportunity_business_fk/);assert.match(migration,/crm_activities_opportunity_business_fk/);
});

test('all exposed mutation RPCs require membership and internal marketplace sync is non-exposed',()=>{
 for(const fn of ['crm_create_contact','crm_create_opportunity','crm_move_opportunity','crm_create_task','crm_create_quote','crm_set_quote_status','crm_create_booking','crm_set_booking_status','crm_merge_contacts','crm_archive_contact','crm_create_calendar_block']){
  const start=migration.indexOf('function public.'+fn);assert.ok(start>=0,fn+' missing');const slice=migration.slice(start,start+6000);assert.match(slice,/auth\.uid\(\) is null or not public\.is_business_member\(p_business_id\)/,fn+' must authorize membership');
 }
 assert.match(migration,/create schema if not exists private/);assert.match(migration,/revoke all on schema private from public, anon, authenticated/);
 for(const fn of ['crm_sync_marketplace_opportunity','crm_sync_marketplace_quote','crm_sync_marketplace_booking']){assert.match(migration,new RegExp('function private\\.'+fn));assert.match(migration,new RegExp('revoke all on function private\\.'+fn+'\\(\\) from public,anon,authenticated'));}
});

test('contacts are durable identities and sales state is handled by opportunities',()=>{
 assert.match(migration,/create table if not exists public\.crm_opportunities/);assert.match(migration,/contact_id uuid not null/);assert.match(migration,/pipeline_id uuid not null/);assert.match(migration,/stage_id uuid not null/);
 assert.match(crm,/createCrmOpportunity/);assert.match(contacts,/One durable record per person or company/);assert.doesNotMatch(contacts,/estimatedValue:/);assert.doesNotMatch(contacts,/updateLeadStatus/);
 assert.match(customer,/multiple deals for this customer over time/);
});

test('pipeline has ordered terminal stages and stage transitions are audited',()=>{
 for(const key of ['NEW_LEAD','CONTACTED','QUALIFIED','QUOTE_SENT','NEGOTIATION','FOLLOW_UP','WON','LOST'])assert.match(migration,new RegExp("'"+key+"'"));
 assert.match(migration,/crm_move_opportunity/);assert.match(migration,/DEAL_STAGE_CHANGED/);assert.match(migration,/lost_reason/);assert.match(deal,/Why was this deal lost/);assert.match(command,/Deals by stage/);
});

test('tasks are typed, date-time based and surfaced by Today',()=>{
 assert.match(migration,/CALL','EMAIL','MESSAGE','FOLLOW_UP','APPOINTMENT','GENERAL/);assert.match(migration,/crm_create_task/);assert.match(deal,/CrmDateTimeField/);assert.match(calendar,/CrmDateTimeField/);assert.match(today,/Overdue/);assert.doesNotMatch(deal,/placeholder="YYYY|placeholder="Date/i);
});

test('professional quotes calculate totals server-side and do not fake delivery',()=>{
 assert.match(migration,/crm_create_quote/);assert.match(migration,/calc_subtotal/);assert.match(migration,/calc_total/);assert.match(migration,/Deposit exceeds total/);assert.match(migration,/crm_quote_items/);
 assert.match(quote,/server recalculates totals on save/);assert.match(quote,/Mark sent/);assert.match(quote,/does not pretend Everest delivered a message/);assert.match(quote,/CONVERT TO BOOKING/);
});

test('CRM bookings detect overlap and preserve native marketplace authority',()=>{
 assert.match(migration,/Booking conflicts with an existing CRM booking/);assert.match(migration,/tstzrange\(b\.scheduled_start,b\.scheduled_end/);assert.match(booking,/Possible double booking/);assert.match(booking,/Everest marketplace conflict requires acknowledgement/);
 assert.match(migration,/linked_marketplace_booking_id/);assert.doesNotMatch(migration,/update public\.bookings set/i);
});

test('marketplace activity feeds CRM by references, not duplicated authoritative records',()=>{
 assert.match(migration,/opportunities_crm_sync/);assert.match(migration,/quotes_crm_sync/);assert.match(migration,/bookings_crm_sync/);
 assert.match(migration,/linked_service_request_id/);assert.match(migration,/linked_marketplace_opportunity_id/);assert.match(migration,/linked_marketplace_quote_id/);assert.match(migration,/linked_marketplace_booking_id/);
 assert.match(migration,/MARKETPLACE_LEAD_RECEIVED/);assert.match(migration,/MARKETPLACE_QUOTE_/);assert.match(migration,/MARKETPLACE_BOOKING_/);
});

test('contact merge preserves dependent CRM objects and archives the secondary record',()=>{
 const start=migration.indexOf('function public.crm_merge_contacts');const slice=migration.slice(start,start+7000);
 for(const table of ['crm_opportunities','crm_tasks','crm_notes','crm_activities','crm_quotes','crm_bookings'])assert.match(slice,new RegExp('update public\\.'+table+' set contact_id=p.id'));
 assert.match(slice,/merged_into_id=p.id/);assert.match(slice,/CONTACT_MERGED/);assert.match(slice,/linked to different Everest users/);
});

test('business navigation is now Today, CRM, Calendar, Inbox, Business',()=>{
 for(const label of ['Today','CRM','Calendar','Inbox','Business'])assert.match(tabs,new RegExp("label:'"+label+"'"));
 assert.doesNotMatch(tabs,/label:'Leads'/);assert.doesNotMatch(tabs,/label:'Customers'/);assert.doesNotMatch(tabs,/label:'Jobs'/);
});

test('Customer 360 is a tabbed record instead of one giant sales-state page',()=>{
 for(const tab of ['OVERVIEW','TIMELINE','DEALS','QUOTES','BOOKINGS','PAYMENTS','NOTES','TASKS'])assert.match(customer,new RegExp("'"+tab+"'"));
 assert.match(customer,/Lifetime value/);assert.match(customer,/Open deals/);assert.match(customer,/Everest linked/);assert.doesNotMatch(customer,/updateLeadStatus/);
});

test('calendar aggregates CRM bookings, Everest bookings, tasks and blocked time',()=>{
 for(const kind of ['CRM_BOOKING','EVEREST_BOOKING','TASK','BLOCK'])assert.match(calendar,new RegExp(kind));
 assert.match(migration,/create table if not exists public\.crm_calendar_blocks/);assert.match(calendar,/DAY','WEEK','AGENDA/);assert.match(calendar,/MANAGE AVAILABILITY/);
});

test('reports and stale-deal views use recorded values rather than fabricated forecasts',()=>{
 assert.match(command,/CRM performance/);assert.match(command,/No probability or revenue is inferred when it is missing/);assert.match(command,/Lead sources/);assert.match(command,/STALE/);assert.match(today,/No activity for 3\+ days and no next task/);
});
