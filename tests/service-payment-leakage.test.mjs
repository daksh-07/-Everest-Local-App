import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260926232000_service_payment_leakage_controls.sql');
const checkout=read('supabase/functions/service-checkout/index.ts');
const booking=read('app/booking.tsx');
const messages=read('app/messages.tsx');

test('marketplace service quotes cannot create zero-payment bookings',()=>{
 assert.match(migration,/minimum_deposit:=least\(p_total,public\.calculate_service_platform_fee\(p_total\)\)/);
 assert.match(migration,/effective_deposit:=greatest/);
 assert.match(migration,/'PENDING_PAYMENT',true/);
});

test('service commission is reserved once from the whole job across deposit and balance',()=>{
 const split=fs.readFileSync('supabase/migrations/20260929134000_preserve_split_service_fee_v2.sql','utf8');
 assert.match(split,/select q\.total into job_total/);
 assert.match(split,/full_fee:=public\.calculate_service_platform_fee\(coalesce\(job_total,new\.amount\)\)/);
 assert.match(split,/sp\.status='SUCCEEDED'/);
 assert.match(split,/full_fee-prior_fee/);
 assert.match(split,/least\(new\.amount,greatest\(full_fee-prior_fee,0\)\)/);
 assert.match(split,/fee_policy_version:='2026-09-v2'/);
});

test('marketplace quotes require active business authority and Stripe payout readiness',()=>{
 const gate=fs.readFileSync('supabase/migrations/20260929140000_harden_marketplace_quote_payment_readiness.sql','utf8');
 const leads=fs.readFileSync('app/business-leads.tsx','utf8');
 assert.match(gate,/has_business_permission\(p_business_id,'JOB_UPDATE_ALL'\)/);
 assert.match(gate,/has_business_permission\(p_business_id,'CRM_MANAGE'\)/);
 assert.match(gate,/is_business_payment_ready\(p_business_id\)/);
 assert.match(gate,/is_business_payment_ready\(q\.business_id\)/);
 assert.match(gate,/calculate_service_platform_fee\(p_total\)/);
 assert.match(gate,/greatest\(round\(p_deposit,2\),v_minimum_deposit\)/);
 assert.match(leads,/amount<=0/);
});

test('instant booking cannot bypass payout readiness or marketplace payment authority',()=>{
 const instant=fs.readFileSync('supabase/migrations/20260930090500_harden_instant_booking_payment_authority.sql','utf8');
 assert.match(instant,/is_business_payment_ready\(s\.business_id\)/);
 assert.match(instant,/calculate_service_platform_fee\(s\.base_price\)/);
 assert.match(instant,/s\.base_price,minimum_deposit,s\.base_price/);
 assert.match(instant,/'PENDING_PAYMENT',true/);
 assert.doesNotMatch(instant,/values\([\s\S]{0,400}s\.base_price,0,s\.base_price/);
});

test('service checkout supports deposit then remaining balance',()=>{
 assert.match(migration,/payment_kind in \('DEPOSIT','BALANCE'\)/);
 assert.match(migration,/next_kind:='BALANCE'/);
 assert.match(migration,/remaining:=round\(greatest\(q\.total-paid,0\),2\)/);
 assert.match(checkout,/service booking balance/);
 assert.match(checkout,/service_payment_stage/);
});

test('latest booking lifecycle keeps Stripe authoritative and paid cancellations reconciled',()=>{
 const guard=fs.readFileSync('supabase/migrations/20260929134500_restore_marketplace_booking_payment_guards.sql','utf8');
 assert.match(guard,/can_operate_business_booking/);
 assert.match(guard,/b\.status='PENDING_PAYMENT'[\s\S]*p_next='CONFIRMED'[\s\S]*paid<=0/);
 assert.match(guard,/Marketplace payment must be confirmed by Stripe/);
 assert.match(guard,/p_next='COMPLETED' and balance_due>0/);
 assert.match(guard,/p_next='CANCELLED' and paid>0/);
 assert.match(guard,/Paid Everest bookings require support cancellation/);
});

test('paid booking lifecycle blocks stale checkout cancellation and unverified business mutation',()=>{
 const guard=fs.readFileSync('supabase/migrations/20260929135000_harden_paid_booking_cancellation_race.sql','utf8');
 assert.match(guard,/can_operate_business_booking/);
 assert.match(guard,/biz\.status='ACTIVE' and biz\.verification_status='VERIFIED'/);
 assert.match(guard,/provider_checkout_session_id/);
 assert.match(guard,/sp\.status='PENDING'/);
 assert.match(guard,/A payment checkout is still open/);
 assert.match(guard,/p_next='CANCELLED'[\s\S]*paid>0/);
 assert.match(guard,/p_next='COMPLETED' and balance_due>0/);
});

test('marketplace booking cannot complete with unpaid Everest balance',()=>{
 assert.match(migration,/p_next='COMPLETED' and balance_due>0/);
 assert.match(migration,/Outstanding Everest balance must be paid/);
 assert.match(booking,/PAY \$\$\{paymentSummary\.balance_due\.toFixed\(2\)\} BALANCE/);
});

test('likely off-platform payment solicitation is auditable and users see payment safety',()=>{
 assert.match(migration,/payment_circumvention_flags/);
 assert.match(migration,/payid\|pay id\|osko\|bank transfer/);
 assert.match(migration,/PAYMENT_SAFETY_REMINDER/);
 assert.match(messages,/Keep service payments in Everest/);
});
