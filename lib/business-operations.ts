import {supabase} from './supabase';
import {userFacingError} from './errors';

export const BUSINESS_ROLES=[
 'ADMIN','OPERATIONS_MANAGER','DISPATCHER','FINANCE','CRM_SALES','TEAM_LEADER','TECHNICIAN','CONTRACTOR','READ_ONLY'
] as const;
export type BusinessRole=typeof BUSINESS_ROLES[number]|'OWNER'|'MANAGER'|'STAFF';

export type BusinessInvitation={
 id:string;business_id:string;business_name?:string;email?:string;member_role:BusinessRole|string;
 display_name:string|null;job_title:string|null;location_id?:string|null;is_dispatchable?:boolean;expires_at:string;
};
export type BusinessLocation={
 id:string;name:string;address_line:string|null;suburb:string|null;city:string|null;state:string|null;postcode:string|null;
 is_primary:boolean;active:boolean;
};
export type BusinessMember={
 user_id:string;name:string;avatar_url:string|null;member_role:BusinessRole|string;status:string;job_title:string|null;
 employee_number:string|null;location_id:string|null;is_dispatchable:boolean;
};
export type BusinessTeamMember={user_id:string;team_role:'LEAD'|'MEMBER'};
export type BusinessTeam={
 id:string;name:string;description:string|null;location_id:string|null;member_count:number;members:BusinessTeamMember[];
};
export type OperationsJob={
 source:'EVEREST'|'CRM';booking_id:string|null;crm_booking_id:string|null;label:string;customer_name:string;
 scheduled_at:string|null;location:string|null;status:string;
};
export type BusinessAssignment={
 id:string;booking_id:string|null;crm_booking_id:string|null;assigned_user_id:string|null;team_id:string|null;
 status:string;note:string|null;updated_at:string;assignee_name:string;
};
export type OperationsDashboard={
 permissions:{team_view:boolean;team_manage:boolean;job_view_all:boolean;job_assign:boolean};
 stats:{active_staff:number;dispatchable_staff:number;teams:number;locations:number;active_assignments:number};
 members:BusinessMember[];locations:BusinessLocation[];teams:BusinessTeam[];invitations:BusinessInvitation[];
 unassigned_jobs:OperationsJob[];assignments:BusinessAssignment[];
};
export type AssignedJob={
 assignment_id:string;source:'EVEREST'|'CRM';booking_id:string|null;crm_booking_id:string|null;status:string;job_status:string;
 label:string;customer_name:string;scheduled_at:string|null;location:string|null;price:number|null;team_id:string|null;note:string|null;
};

const message=(error:unknown,fallback:string)=>userFacingError(error instanceof Error?error:new Error(String(error)),fallback);

export async function getOperationsDashboard(businessId:string):Promise<OperationsDashboard>{
 const {data,error}=await supabase.rpc('get_business_operations_dashboard',{p_business_id:businessId});
 if(error)throw new Error(message(error,'Business operations could not be loaded.'));
 const value=(data??{}) as Partial<OperationsDashboard>;
 return {
  permissions:{team_view:false,team_manage:false,job_view_all:false,job_assign:false,...value.permissions},
  stats:{active_staff:0,dispatchable_staff:0,teams:0,locations:0,active_assignments:0,...value.stats},
  members:Array.isArray(value.members)?value.members:[],
  locations:Array.isArray(value.locations)?value.locations:[],
  teams:Array.isArray(value.teams)?value.teams:[],
  invitations:Array.isArray(value.invitations)?value.invitations:[],
  unassigned_jobs:Array.isArray(value.unassigned_jobs)?value.unassigned_jobs:[],
  assignments:Array.isArray(value.assignments)?value.assignments:[],
 };
}
export async function getMyAssignedJobs(businessId:string):Promise<AssignedJob[]>{
 const {data,error}=await supabase.rpc('get_my_assigned_jobs',{p_business_id:businessId});
 if(error)throw new Error(message(error,'Your work queue could not be loaded.'));
 return Array.isArray(data)?data as AssignedJob[]:[];
}
export async function getMyBusinessInvitations():Promise<BusinessInvitation[]>{
 const {data,error}=await supabase.rpc('get_my_business_invitations');
 if(error)throw new Error(message(error,'Business invitations could not be loaded.'));
 return Array.isArray(data)?data as BusinessInvitation[]:[];
}
export async function acceptBusinessInvitation(invitationId:string){
 const {data,error}=await supabase.rpc('accept_business_invitation',{p_invitation_id:invitationId});
 if(error)throw new Error(message(error,'The invitation could not be accepted.'));
 return String(data);
}
export async function inviteBusinessMember(input:{
 businessId:string;email:string;role:BusinessRole;displayName?:string;jobTitle?:string;employeeNumber?:string;
 locationId?:string|null;isDispatchable?:boolean;
}){
 const {data,error}=await supabase.rpc('invite_business_member',{
  p_business_id:input.businessId,p_email:input.email,p_member_role:input.role,p_display_name:input.displayName?.trim()||null,
  p_job_title:input.jobTitle?.trim()||null,p_employee_number:input.employeeNumber?.trim()||null,
  p_location_id:input.locationId??null,p_is_dispatchable:input.isDispatchable??false,
 });
 if(error)throw new Error(message(error,'The team invitation could not be created.'));
 return String(data);
}
export async function revokeBusinessInvitation(businessId:string,invitationId:string){
 const {data,error}=await supabase.rpc('revoke_business_invitation',{p_business_id:businessId,p_invitation_id:invitationId});
 if(error||data!==true)throw new Error(message(error,'The invitation could not be revoked.'));
}
export async function updateBusinessMember(input:{
 businessId:string;userId:string;role:BusinessRole;jobTitle?:string;employeeNumber?:string;locationId?:string|null;
 isDispatchable?:boolean;status?:'ACTIVE'|'SUSPENDED';
}){
 const {data,error}=await supabase.rpc('update_business_member',{
  p_business_id:input.businessId,p_user_id:input.userId,p_member_role:input.role,p_job_title:input.jobTitle?.trim()||null,
  p_employee_number:input.employeeNumber?.trim()||null,p_location_id:input.locationId??null,
  p_is_dispatchable:input.isDispatchable??false,p_status:input.status??'ACTIVE',
 });
 if(error||data!==true)throw new Error(message(error,'The team member could not be updated.'));
}
export async function removeBusinessMember(businessId:string,userId:string){
 const {data,error}=await supabase.rpc('remove_business_member',{p_business_id:businessId,p_user_id:userId});
 if(error||data!==true)throw new Error(message(error,'The team member could not be removed.'));
}
export async function createBusinessLocation(input:{
 businessId:string;name:string;addressLine?:string;suburb?:string;city?:string;state?:string;postcode?:string;country?:string;isPrimary?:boolean;
}){
 const {data,error}=await supabase.rpc('create_business_location',{
  p_business_id:input.businessId,p_name:input.name,p_address_line:input.addressLine?.trim()||null,
  p_suburb:input.suburb?.trim()||null,p_city:input.city?.trim()||null,p_state:input.state?.trim()||null,
  p_postcode:input.postcode?.trim()||null,p_country:input.country?.trim()||'Australia',
  p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Australia/Sydney',p_is_primary:input.isPrimary??false,
 });
 if(error)throw new Error(message(error,'The location could not be created.'));
 return String(data);
}
export async function createBusinessTeam(input:{businessId:string;name:string;description?:string;locationId?:string|null}){
 const {data,error}=await supabase.rpc('create_business_team',{
  p_business_id:input.businessId,p_name:input.name,p_description:input.description?.trim()||null,p_location_id:input.locationId??null,
 });
 if(error)throw new Error(message(error,'The team could not be created.'));
 return String(data);
}
export async function setBusinessTeamMember(input:{businessId:string;teamId:string;userId:string;teamRole?:'LEAD'|'MEMBER';enabled:boolean}){
 const {data,error}=await supabase.rpc('set_business_team_member',{
  p_business_id:input.businessId,p_team_id:input.teamId,p_user_id:input.userId,p_team_role:input.teamRole??'MEMBER',p_enabled:input.enabled,
 });
 if(error||data!==true)throw new Error(message(error,'Team membership could not be changed.'));
}
export async function assignBusinessJob(input:{
 businessId:string;bookingId?:string|null;crmBookingId?:string|null;assignedUserId?:string|null;teamId?:string|null;note?:string;
}){
 const {data,error}=await supabase.rpc('assign_business_job',{
  p_business_id:input.businessId,p_booking_id:input.bookingId??null,p_crm_booking_id:input.crmBookingId??null,
  p_assigned_user_id:input.assignedUserId??null,p_team_id:input.teamId??null,p_note:input.note?.trim()||null,
 });
 if(error)throw new Error(message(error,'The job could not be assigned.'));
 return String(data);
}
export async function updateAssignmentStatus(assignmentId:string,status:'ACCEPTED'|'EN_ROUTE'|'ARRIVED'|'IN_PROGRESS'|'COMPLETED'|'DECLINED'|'CANCELLED'){
 const {data,error}=await supabase.rpc('update_business_job_assignment_status',{p_assignment_id:assignmentId,p_status:status});
 if(error||data!==true)throw new Error(message(error,'The job status could not be updated.'));
}
