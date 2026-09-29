import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=[
 'supabase/migrations/20260927121749_business_ops_01_structure.sql',
 'supabase/migrations/20260927121756_business_ops_02_permissions.sql',
 'supabase/migrations/20260927121803_business_ops_03_members.sql',
 'supabase/migrations/20260927121813_business_ops_04_assignment.sql',
 'supabase/migrations/20260927121828_business_ops_04_dashboard.sql',
 'supabase/migrations/20260927121836_business_ops_05_rls.sql',
 'supabase/migrations/20260927121844_business_ops_06_job_lifecycle.sql',
 'supabase/migrations/20260927121851_business_ops_06_messaging_live.sql',
].map(read).join('\n');
const workspace=read('lib/workspace.ts');
const tabbar=read('components/BusinessTabBar.tsx');
const switcher=read('components/ModeSwitcher.tsx');
const command=read('app/business-operations.tsx');
const work=read('app/business-my-work.tsx');
const jobs=read('app/business-jobs.tsx');
const control=read('app/business-control.tsx');
const stripe=read('supabase/functions/stripe-connect/index.ts');
const inviteEmail=read('supabase/functions/business-invite-email/index.ts');
const inviteRoute=read('app/business-invite.tsx');
const operationsClient=read('lib/business-operations.ts');
const authScreen=read('app/auth.tsx');

test('businesses stay the organization root while staff structure is additive',()=>{
 for(const table of ['business_locations','business_staff_invitations','business_member_permission_overrides','business_teams','business_team_members','business_member_skills','business_staff_shifts','business_job_assignments','business_job_events','booking_job_records','booking_job_checklist_items']){
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

test('employee invitations send real authenticated email and deep-link back to acceptance',()=>{
 assert.match(operationsClient,/functions\.invoke\('business-invite-email'/);
 assert.match(inviteEmail,/Deno\.env\.get\('RESEND_API_KEY'\)/);
 assert.match(inviteEmail,/https:\/\/api\.resend\.com\/emails/);
 assert.match(inviteEmail,/has_business_permission/);
 assert.match(inviteEmail,/TEAM_MANAGE/);
 assert.match(inviteEmail,/business-invite\?invitationId=/);
 assert.match(inviteEmail,/Idempotency-Key/);
 assert.match(inviteEmail,/BUSINESS_INVITATION_EMAIL_SENT/);
 assert.match(inviteRoute,/acceptBusinessInvitation/);
 assert.match(inviteRoute,/storePendingQuickActionRoute/);
 assert.match(inviteRoute,/everest-auth-return-to/);
 assert.match(authScreen,/everest-auth-return-to/);
 assert.match(command,/RESEND/);
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

test('employee work completion cannot bypass authoritative marketplace payment guards',()=>{
 const hardening=read('supabase/migrations/20260930084000_restore_paid_order_and_job_integrity.sql');
 const start=hardening.indexOf('create or replace function public.update_business_job_assignment_status');
 const slice=hardening.slice(start);
 assert.match(slice,/perform public\.update_booking_status\(a\.booking_id,'UPCOMING'\)/);
 assert.match(slice,/perform public\.update_booking_status\(a\.booking_id,'IN_PROGRESS'\)/);
 assert.match(slice,/perform public\.update_booking_status\(a\.booking_id,'COMPLETED'\)/);
 assert.doesNotMatch(slice,/update public\.bookings set status='COMPLETED'/);
});

test('Everest Live provider acceptance bridges into the employee work queue',()=>{
 assert.match(migration,/function private\.sync_service_dispatch_business_assignment/);
 assert.match(migration,/service_dispatch_business_assignment_sync/);
 assert.match(migration,/join public\.bookings b on b\.id=sda\.booking_id/);
 assert.doesNotMatch(migration,/service_provider_profiles/);
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

test('owner job queue is work-first and field workers cannot use the all-jobs surface',()=>{
 for(const label of ["'TODAY'","'UPCOMING'","'ACTIVE'","'COMPLETED'"])assert.match(jobs,new RegExp(label));
 assert.match(jobs,/if\(!current\.can_view_all_jobs\)/);
 assert.match(jobs,/router\.replace\('\/business-my-work'\)/);
 assert.match(jobs,/Booked work lives here/);
 assert.match(jobs,/business-leads/);
 assert.match(migration,/bookings_participant_access[\s\S]*JOB_VIEW_ALL[\s\S]*can_operate_business_booking/);
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
