import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard=fs.readFileSync('app/business-dashboard.tsx','utf8');
const workspace=fs.readFileSync('lib/workspace.ts','utf8');

test('generic Business login resolves to the active role-aware workspace home',()=>{
 assert.match(dashboard,/getWorkspaceContext/);
 assert.match(dashboard,/businessHomeRoute\(current\)/);
 assert.doesNotMatch(dashboard,/Redirect href="\/business-today"/);
});

test('workforce and finance accounts do not share the owner home route',()=>{
 assert.match(workspace,/if\(role==='FINANCE'\)return'\/business-control'/);
 assert.match(workspace,/return isWorkforceWorkspace\(business\)\?'\/business-my-work'/);
 assert.match(workspace,/WORKFORCE_ROLES/);
});
