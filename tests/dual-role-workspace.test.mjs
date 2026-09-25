import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260925150000_dual_role_workspace_preferences.sql',import.meta.url),'utf8');
const requestPostsMigration=fs.readFileSync(new URL('../supabase/migrations/20260925162000_request_posts_matching_ux.sql',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../lib/workspace.ts',import.meta.url),'utf8');
const tabbar=fs.readFileSync(new URL('../components/BusinessTabBar.tsx',import.meta.url),'utf8');
const today=fs.readFileSync(new URL('../app/business-today.tsx',import.meta.url),'utf8');
const leads=fs.readFileSync(new URL('../app/business-leads.tsx',import.meta.url),'utf8');
const jobs=fs.readFileSync(new URL('../app/business-jobs.tsx',import.meta.url),'utf8');
const inbox=fs.readFileSync(new URL('../app/business-inbox.tsx',import.meta.url),'utf8');
const control=fs.readFileSync(new URL('../app/business-control.tsx',import.meta.url),'utf8');
const assistant=fs.readFileSync(new URL('../supabase/functions/assistant/index.ts',import.meta.url),'utf8');

test('business mode preference validates membership server-side',()=>{
 assert.match(migration,/business_members bm[\s\S]*bm\.user_id=v_uid[\s\S]*bm\.business_id=p_active_business_id/);
 assert.match(migration,/raise exception 'Business access denied'/);
 assert.match(migration,/security definer[\s\S]*set search_path=''/);
});

test('multi-business quote submission binds the explicit business',()=>{
 assert.match(migration,/send_quote_for_business/);
 assert.match(migration,/o\.business_id=p_business_id/);
 assert.match(migration,/bm\.business_id=p_business_id/);
 assert.match(migration,/insert into public\.quotes/);
 assert.doesNotMatch(leads,/rpc\('send_quote'/);
 assert.match(leads,/rpc\('send_quote_for_business'/);
});

test('workspace architecture preserves customer and business modes',()=>{
 assert.match(workspace,/AppMode='CUSTOMER'\|'BUSINESS'/);
 assert.match(workspace,/active_business_id/);
 assert.match(workspace,/businesses:BusinessWorkspace\[\]/);
});

test('business navigation is operationally distinct',()=>{
 for(const label of ['Today','Leads','Jobs','Inbox','Business']) assert.match(tabbar,new RegExp("label:'"+label+"'"));
});

test('business surfaces scope queries to active business',()=>{
 for(const source of [today,leads,jobs,inbox,control]) assert.match(source,/active_business_id/);
 for(const source of [today,jobs,inbox,control]) assert.match(source,/\.eq\('business_id'/);
 assert.match(leads,/p_business_id:current\.id/);
 assert.match(requestPostsMigration,/list_my_business_opportunities[\s\S]*public\.is_business_member\(p_business_id\)/);
});

test('business inbox explicitly excludes personal chat surface',()=>{
 assert.match(inbox,/Personal chats stay in Customer Mode/);
 assert.match(inbox,/from\('conversations'\)/);
 assert.doesNotMatch(inbox,/personal_conversations/);
});

test('Ask Everest only loads business records for an authorized selected business',()=>{
 assert.match(assistant,/requestedMode === 'BUSINESS'/);
 assert.match(assistant,/memberships\.includes\(requestedBusinessId\)/);
 assert.match(assistant,/const businessIds = requestedMode === 'BUSINESS'[\s\S]*\[requestedBusinessId\]/);
 assert.match(assistant,/requestedMode === 'BUSINESS' \? \[\] : \(requestResult\.data/);
});
