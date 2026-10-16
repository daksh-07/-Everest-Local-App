import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatDay,formatMoney,formatSchedule,formatStatus,formatTime} from '../lib/format.ts';

const read=path=>fs.readFileSync(path,'utf8');
const now=new Date(2026,9,16,12,0);

test('dates read as people say them, and date-only values are local days',()=>{
 assert.equal(formatDay('2026-10-16',{now}),'Today');
 assert.equal(formatDay('2026-10-17',{now}),'Tomorrow');
 assert.equal(formatDay('2026-10-15',{now}),'Yesterday');
 assert.match(formatDay('2026-10-20',{now}),/Tue.*20.*Oct/);
 assert.match(formatDay('2025-12-01',{now}),/2025/);
 assert.equal(formatDay(null),'');assert.equal(formatDay('not a date'),'');
});

test('times, schedules, money and statuses are formatted without raw server values',()=>{
 assert.equal(formatTime('10:00:00'),'10:00 am');
 assert.equal(formatTime('14:30'),'2:30 pm');
 assert.equal(formatTime('garbage'),'');
 assert.equal(formatSchedule('2026-10-17','09:15',{now}),'Tomorrow · 9:15 am');
 assert.equal(formatSchedule('2026-10-17',null,{now}),'Tomorrow');
 assert.equal(formatMoney(1299.5),'$1,299.50');
 assert.equal(formatMoney(null),'');assert.equal(formatMoney('x'),'');
 assert.equal(formatStatus('PENDING_PAYMENT'),'Pending payment');
 assert.equal(formatStatus(''),'Pending');
});

test('Live mini player only shows the signed-in customer’s own request',()=>{
 const player=read('components/EverestLiveMiniPlayer.tsx');
 // RLS lets admins read every service request; the client must scope explicitly.
 assert.match(player,/\.eq\('customer_id',customerId\)/);
 assert.match(player,/filter=`customer_id=eq\.\$\{customerId\}`/);
 assert.match(player,/auth\.getSession\(\)/);
 assert.doesNotMatch(player,/fontSize:8\b/,'no sub-legible text in the player');
});

test('Ask Everest is a header action, never a floating button over content',()=>{
 assert.ok(!fs.existsSync('components/DraggableAskEverest.tsx'));
 assert.doesNotMatch(read('app/_layout.tsx'),/DraggableAskEverest/);
 // Reachable from the customer Home search bar, customer Profile, Business Today and the employee home.
 assert.match(read('app/index.tsx'),/accessibilityLabel="Ask Everest for help"/);
 for(const screen of ['app/account.tsx','app/business-today.tsx','app/business-my-work.tsx'])assert.match(read(screen),/<AskEverestButton\/>/,screen);
 assert.match(read('components/AskEverestButton.tsx'),/router\.push\('\/assistant'\)/);
});

test('Home keeps every capability reachable after removing the duplicate menu',()=>{
 const home=read('app/index.tsx');
 assert.doesNotMatch(home,/homeMenuItems|menuOpen/);
 for(const route of ["'/assistant'","'/shop'","'/request'","'/request?live=1'","'/notifications'","'/account'","'/search'","'/social'","'/create'"])assert.ok(home.includes(route),route+' reachable from Home');
 // Shop entry stays visible even when no products load.
 assert.match(home,/Browse products from local businesses/);
 assert.doesNotMatch(home,/from '@\/lib\/ui'/);
});

test('Activity leads with work that needs a decision and avoids duplicate destinations',()=>{
 const activity=read('app/activity.tsx');
 assert.ok(activity.indexOf("group('Needs your attention'")<activity.indexOf("Text accessibilityRole=\"header\" style={s.groupTitle}>More"));
 assert.doesNotMatch(activity,/Local community/);
 assert.match(activity,/ATTENTION=new Set\(\['PENDING_PAYMENT','SENT','VIEWED','QUOTING'\]\)/);
});

test('shared section header replaces ad-hoc uppercase section labels',()=>{
 const today=read('app/business-today.tsx');
 assert.doesNotMatch(today,/>WORK QUEUE<|>QUICK ACTIONS<|>SALES & CRM</);
 assert.ok(fs.existsSync('components/ui/SectionHeader.tsx'));
});

test('business opportunity screens act only for the active workspace business',()=>{
 const opp=read('app/opportunities.tsx');const search=read('app/search.tsx');
 // RLS admits admins and members of other businesses; send_quote picks the oldest authorised business.
 assert.match(opp,/\.eq\('business_id',businessId\)\.eq\('status','OPEN'\)/);
 assert.match(opp,/rpc\('send_quote_for_business',\{p_business_id:businessId,/);
 assert.doesNotMatch(opp,/rpc\('send_quote',/);
 assert.doesNotMatch(opp,/from\('opportunities'\)\.select\([^)]*\)\.eq\('status','OPEN'\)/,'no unscoped opportunity list');
 assert.match(search,/\.eq\('business_id',workspace\.active_business_id\)/);
});
