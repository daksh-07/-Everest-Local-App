import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('dispatch client migration restores least-privilege reads and removes the dropped profile dependency',async()=>{
 const sql=await readFile('supabase/migrations/20260922084533_repair_service_dispatch_client_contract.sql','utf8');
 for(const table of ['service_provider_capabilities','service_provider_locations','service_dispatch_jobs','service_dispatch_offers','service_dispatch_assignments'])assert.match(sql,new RegExp(`grant select on table public\\.${table} to authenticated`));
 assert.match(sql,/set_service_provider_capability/);
 assert.match(sql,/dispatch_driver_is_operational\(uid\)/);
 assert.match(sql,/business_members/);
 assert.doesNotMatch(sql,/service_provider_profiles/);
 assert.match(sql,/revoke all on function public\.set_service_provider_capability\(uuid,boolean\) from public,anon/);
 assert.match(sql,/update_my_service_dispatch_assignment/);
 assert.match(sql,/provider_id=uid for update/);
 assert.match(sql,/job\.status<>'ASSIGNED'/);
 assert.match(sql,/status='IN_PROGRESS'/);
 assert.match(sql,/status='COMPLETED'/);
 assert.doesNotMatch(sql,/update public\.(bookings|service_requests) set/);
});

test('Stripe webhook uses Deno-compatible asynchronous signature verification',async()=>{
 const source=await readFile('supabase/functions/stripe-webhook/index.ts','utf8');
 assert.match(source,/createSubtleCryptoProvider\(\)/);
 assert.match(source,/await stripe\.webhooks\.constructEventAsync\(/);
 assert.doesNotMatch(source,/stripe\.webhooks\.constructEvent\(/);
});

test('web checkout and cancellation expose in-page recovery controls',async()=>{
 const [cart,bookings]=await Promise.all([readFile('app/cart.tsx','utf8'),readFile('app/bookings.tsx','utf8')]);
 assert.doesNotMatch(cart,/Alert\.alert/);
 assert.match(cart,/accessibilityRole="alert"/);
 assert.match(cart,/inFlight\.current/);
 assert.doesNotMatch(bookings,/Alert\.alert/);
 assert.match(bookings,/CONFIRM CANCELLATION/);
 assert.match(bookings,/KEEP BOOKING/);
});
