import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const alert=fs.readFileSync('components/BusinessOpportunityAlert.tsx','utf8');
const opp=fs.readFileSync('app/opportunities.tsx','utf8');
const mig=fs.readFileSync('supabase/migrations/20260926214500_instant_opportunity_alerts.sql','utf8');
test('instant opportunity alert is short lived and non-destructive when ignored',()=>{assert.match(alert,/DISPLAY_MS=5000/);assert.match(alert,/request stays in Opportunities if you ignore it/);assert.doesNotMatch(alert,/delete\(/);});
test('view and quote deep-links the matched request',()=>{assert.match(alert,/pathname:'\/opportunities',params:\{requestId\}/);assert.match(opp,/useLocalSearchParams/);assert.match(opp,/setQuoteId\(params\.requestId\)/);});
test('decline is server-authorized and scoped to business membership',()=>{assert.match(mig,/security definer/);assert.match(mig,/bm\.user_id=auth\.uid\(\)/);assert.match(mig,/status='OPEN'/);assert.match(mig,/status='DECLINED'/);});
test('opportunity notification includes business and route context',()=>{assert.match(mig,/'business_id',new\.business_id/);assert.match(mig,/'route','\/opportunities'/);});
