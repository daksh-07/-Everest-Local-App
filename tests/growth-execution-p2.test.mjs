import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20260926233000_growth_execution_p2.sql','utf8');const ui=fs.readFileSync('app/business-growth-p1.tsx','utf8');
test('rewards are ledger-backed and idempotent',()=>{assert.match(sql,/source_key text not null unique/);assert.match(sql,/on conflict\(source_key\) do nothing/);assert.match(sql,/growth_booking_completed/);});
test('referrals qualify only from completed bookings',()=>{assert.match(sql,/status='COMPLETED'/);assert.match(sql,/minimum_completed_jobs/);assert.match(sql,/referral:referrer:/);assert.match(sql,/referral:friend:/);});
test('waitlist offers are deduplicated and availability driven',()=>{assert.match(sql,/unique\(waitlist_id,available_from,available_until\)/);assert.match(sql,/growth_waitlist_slot_opened/);assert.match(sql,/WAITLIST_SLOT/);});
test('campaign execution is in-app only and deduplicated',()=>{assert.match(sql,/if c\.channel<>'IN_APP'/);assert.match(sql,/unique\(campaign_id,customer_id,channel\)/);assert.match(sql,/INACTIVE_60D/);assert.match(sql,/QUOTE_PENDING_2D/);});
test('growth assistant is deterministic from business data',()=>{assert.match(sql,/get_growth_recommendations/);assert.match(ui,/Growth Assistant/);assert.match(ui,/getGrowthRecommendations/);});
