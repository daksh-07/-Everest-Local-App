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

test('service checkout supports deposit then remaining balance',()=>{
 assert.match(migration,/payment_kind in \('DEPOSIT','BALANCE'\)/);
 assert.match(migration,/next_kind:='BALANCE'/);
 assert.match(migration,/remaining:=round\(greatest\(q\.total-paid,0\),2\)/);
 assert.match(checkout,/service booking balance/);
 assert.match(checkout,/service_payment_stage/);
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
