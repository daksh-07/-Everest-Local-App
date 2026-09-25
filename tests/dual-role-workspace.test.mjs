import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260925150000_dual_role_workspace_preferences.sql',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../lib/workspace.ts',import.meta.url),'utf8');
const tabbar=fs.readFileSync(new URL('../components/BusinessTabBar.tsx',import.meta.url),'utf8');

test('business mode preference validates membership server-side',()=>{
 assert.match(migration,/business_members bm where bm\.user_id=v_uid and bm\.business_id=p_active_business_id/);
 assert.match(migration,/raise exception 'Business access denied'/);
 assert.match(migration,/security definer[\s\S]*set search_path=''/);
});
test('workspace architecture preserves customer and business modes',()=>{
 assert.match(workspace,/AppMode='CUSTOMER'\|'BUSINESS'/);
 assert.match(workspace,/active_business_id/);
 assert.match(workspace,/businesses:BusinessWorkspace\[\]/);
});
test('business navigation is operationally distinct',()=>{
 for(const label of ['Today','Leads','Jobs','Inbox','Business']) assert.match(tabbar,new RegExp(`label:'${label}'`));
});
