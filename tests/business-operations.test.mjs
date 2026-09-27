import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=[
 'supabase/migrations/20260927193000_business_ops_01_structure.sql',
 'supabase/migrations/20260927193100_business_ops_02_permissions.sql',
 'supabase/migrations/20260927193200_business_ops_03_members.sql',
 'supabase/migrations/20260927193300_business_ops_04_assignment.sql',
 'supabase/migrations/20260927193350_business_ops_04_dashboard.sql',
 'supabase/migrations/20260927193400_business_ops_05_rls.sql',
 'supabase/migrations/20260927193500_business_ops_06_job_lifecycle.sql',
 'supabase/migrations/20260927193550_business_ops_06_messaging_live.sql',
].map(read).join('\n');
const operations=read('lib/business-operations.ts');
const workspace=read('lib/workspace.ts');
const tabbar=read('components/BusinessTabBar.tsx');
const switcher=read('components/ModeSwitcher.tsx');
const command=read('app/business-operations.tsx');
const work=read('app/business-my-work.tsx');
const control=read('app/business-control.tsx');
const stripe=read('supabase/functions/stripe-connect/index.ts');

test('businesses stay the organization root while staff structure is additive',()=>{
 for(const table of ['business_locations','business_staff_invitations','business_member_permission_overrides','business_teams','business_team_members','business_member_skills','business_staff_shifts','business_job_assignments','business_job_events']){
  assert.match(migration,new RegExp('create table if not exists public\\.'+table));
 }
 assert.match(migration,/alter table public\.business_members[\s\S]*status text not null default 'ACTIVE'/);
 assert.match(migration,/foreign key\(business_id,user_id\) references public\.business_members/);
 assert.doesNotMatch(migration,/create table if not exists public\.business_organizations/);
});

test('role permissions are server-authoritative and payout ownership cannot be delegated',()=>{
 assert.match(migration,/function public\.business_role_has_permission/);
 assert.match(migration,/function public\.has_business_permission/);
 for(const role of ['OWNER','ADMIN','OPERATIONS_MANAGER','DISPATCHER','FINANCE','CRM_SALES','TEAM_LEADER','TECHNICIAN','CONTRACTOR','READ_ONLY'])assert.match(migration,new RegExp("'"+role+"'"));
 assert.match(migration,/Payout ownership cannot be delegated/);
 assert.match(stripe,/action==='onboard'&&role!=='OWNER'/);
 assert.match(stripe,/Only the business owner can manage the payout account/);
});

test('employee invitations cannot self-promote and are bound to the signed-in email',()=>{
 assert.match(migration,/function public\.invite_business_member/);
 assert.match(migration,/public\.can_grant_business_role\(v_actor_role,v_role\)/);
 assert.match(migration,/function public\.accept_business_invitation/);
 assert.match(migration,/lower\(i\.email\)<>v_email/);
 assert.match(migration,/This invitation belongs to a different email address/);
 assert.doesNotMatch(migration,/member_role[^\n]*p_member_role[^\n]*without/i);
 assert.match(switcher,/getMyBusinessInvitations/);
 assert.match(switcher,/acceptBusinessInvitation/);
});

test('jobs have exactly one commercial source and one assignee target',()=>{
 assert.match(migration,/check\(num_nonnulls\(booking_id,crm_booking_id\)=1\)/);
 assert.match(migration,/check\(num_nonnulls\(assigned_user_id,team_id\)=1\)/);
 assert.match(migration,/business_job_assignments_marketplace_active_uidx/);
 assert.match(migration,/business_job_assignments_crm_active_uidx/);
 assert.match(migration,/function public\.assign_business_job/);
});

test('worker job transitions are constrained and synchronize authoritative booking state',()=>{
 assert.match(migration,/\(a\.status='ASSIGNED' and v_status in \('ACCEPTED','DECLINED'\)\)/);
 assert.match(migration,/\(a\.status='ACCEPTED' and v_status='EN_ROUTE'\)/);
 assert.match(migration,/\(a\.status='EN_ROUTE' and v_status='ARRIVED'\)/);
 assert.match(migration,/\(a\.status='ARRIVED' and v_status='IN_PROGRESS'\)/);
 assert.match(migration,/\(a\.status='IN_PROGRESS' and v_status='COMPLETED'\)/);
 assert.match(migration,/arrival_status=excluded\.arrival_status/);
 assert.match(migration,/update public\.bookings set status='COMPLETED'/);
 assert.match(migration,/update public\.crm_bookings set status='COMPLETED'/);
});

test('Everest Live provider acceptance bridges into the employee work queue',()=>{
 assert.match(migration,/function private\.sync_service_dispatch_business_assignment/);
 assert.match(migration,/service_dispatch_business_assignment_sync/);
 assert.match(migration,/join public\.service_provider_profiles spp/);
 assert.match(migration,/join public\.business_members bm/);
 assert.match(work,/getMyAssignedJobs/);
});

test('employee access hardens finance, messaging, booking and CRM row policies',()=>{
 assert.match(migration,/create policy payouts_business_admin[\s\S]*FINANCE_VIEW/);
 assert.match(migration,/create policy marketplace_payout_ledger_business_read[\s\S]*FINANCE_VIEW/);
 assert.match(migration,/create policy bookings_participant_access[\s\S]*can_operate_business_booking/);
 assert.match(migration,/create policy conversations_participant[\s\S]*can_access_business_conversation/);
 assert.match(migration,/create policy messages_participant_read[\s\S]*can_access_business_conversation/);
 assert.match(migration,/CRM_VIEW/);
 assert.match(migration,/CRM_MANAGE/);
});

test('security definer job and messaging RPCs no longer trust generic membership',()=>{
 for(const fn of ['update_booking_status','ensure_booking_job_record','set_booking_job_progress','add_booking_job_checklist_item','set_booking_job_checklist_item']){
  const start=migration.lastIndexOf('function public.'+fn);assert.ok(start>=0,fn+' missing');
  const slice=migration.slice(start,start+6500);assert.match(slice,/can_operate_business_booking/,fn+' must use assignment-aware authorization');
 }
 const messaging=migration.slice(migration.lastIndexOf('create or replace function public.get_or_create_conversation'),migration.lastIndexOf('create or replace function public.mark_message_read')+3000);
 assert.match(messaging,/INBOX_VIEW_ALL/);
 assert.match(messaging,/can_operate_business_booking/);
});

test('workspace capabilities route field staff into My Work instead of owner dashboards',()=>{
 assert.match(workspace,/isWorkforceWorkspace/);
 assert.match(workspace,/businessHomeRoute/);
 assert.match(workspace,/can_manage_payouts/);
 assert.match(switcher,/businessHomeRoute/);
 assert.match(tabbar,/business-my-work/);
 assert.match(tabbar,/business-operations/);
 assert.match(work,/Only work assigned to you or your crew appears here/);
});

test('operations UI provides team, dispatch, locations and crews without a second business account',()=>{
 for(const label of ['OVERVIEW','DISPATCH','TEAM','STRUCTURE'])assert.match(command,new RegExp("'"+label+"'"));
 assert.match(command,/Invite employee/);
 assert.match(command,/Dispatch board/);
 assert.match(command,/Add location/);
 assert.match(command,/Create crew/);
 assert.match(command,/assignBusinessJob/);
 assert.match(command,/setBusinessTeamMember/);
 assert.match(control,/Team & operations/);
});

test('new exposed tables and functions are explicit about grants and RLS',()=>{
 assert.match(migration,/alter table public\.business_locations enable row level security/);
 assert.match(migration,/revoke all on public\.business_locations[\s\S]*from public,anon,authenticated/);
 assert.match(migration,/grant select on public\.business_locations/);
 for(const fn of ['has_business_permission','invite_business_member','accept_business_invitation','assign_business_job','update_business_job_assignment_status','get_business_operations_dashboard','get_my_assigned_jobs']){
  assert.match(migration,new RegExp('revoke all on function public\\.'+fn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
});
