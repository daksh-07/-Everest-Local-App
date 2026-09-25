import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const migration=readFileSync(new URL('../supabase/migrations/20260925220500_customer_experience_job_portal.sql',import.meta.url),'utf8');
const customerPortal=readFileSync(new URL('../app/booking.tsx',import.meta.url),'utf8');
const businessPortal=readFileSync(new URL('../app/business-job.tsx',import.meta.url),'utf8');
const home=readFileSync(new URL('../app/index.tsx',import.meta.url),'utf8');

test('job progress and checklist records are participant isolated',()=>{
 for(const table of ['booking_job_records','booking_job_checklist_items'])assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
 assert.match(migration,/customer_id = auth\.uid\(\) or public\.is_business_member\(business_id\) or public\.is_admin\(\)/);
 assert.match(migration,/revoke insert, update, delete on public\.booking_job_records from anon, authenticated/);
 assert.match(migration,/revoke insert, update, delete on public\.booking_job_checklist_items from anon, authenticated/);
});

test('job mutation functions enforce business membership and restrict public execution',()=>{
 for(const fn of ['ensure_booking_job_record','set_booking_job_progress','add_booking_job_checklist_item','set_booking_job_checklist_item']){
  assert.match(migration,new RegExp(`create or replace function public\\.${fn}`));
  assert.match(migration,new RegExp(`revoke all on function public\\.${fn}\\(`));
 }
 assert.match(migration,/if not \(public\.is_business_member\(b\.business_id\) or public\.is_admin\(\)\) then raise exception 'Not authorized'/);
});

test('customer portal uses authoritative booking, payment and review records',()=>{
 assert.match(customerPortal,/from\('bookings'\)/);
 assert.match(customerPortal,/from\('service_payments'\)/);
 assert.match(customerPortal,/from\('reviews'\)/);
 assert.match(customerPortal,/createServiceCheckout\(booking\.id\)/);
 assert.doesNotMatch(customerPortal,/Math\.random\(\).*status|fake|mock booking/i);
});

test('business portal exposes operational progress without bypassing booking authority',()=>{
 assert.match(businessPortal,/updateBookingStatus\(job\.id,'IN_PROGRESS'\)/);
 assert.match(businessPortal,/updateBookingStatus\(job\.id,'COMPLETED'\)/);
 assert.match(businessPortal,/Complete the work checklist before finishing this job/);
 assert.match(businessPortal,/Only choose a status when it is true/);
});

test('home has one clear matching action and local trust cues',()=>{
 assert.match(home,/Get matched with local businesses/);
 assert.match(home,/Verified businesses/);
 assert.match(home,/Secure payments/);
 assert.match(home,/CONTINUE WHERE YOU LEFT OFF/);
});
