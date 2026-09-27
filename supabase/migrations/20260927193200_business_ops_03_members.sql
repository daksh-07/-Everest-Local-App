-- ---------- MEMBER / INVITE RPCS ----------

create or replace function public.can_grant_business_role(p_actor_role text,p_target_role text)
returns boolean
language sql
immutable
set search_path=''
as $$
 select case upper(coalesce(p_actor_role,''))
   when 'OWNER' then upper(p_target_role)=any(array[
     'ADMIN','OPERATIONS_MANAGER','DISPATCHER','FINANCE','CRM_SALES','TEAM_LEADER','TECHNICIAN','CONTRACTOR','READ_ONLY','MANAGER','STAFF'
   ])
   when 'ADMIN' then upper(p_target_role)=any(array[
     'OPERATIONS_MANAGER','DISPATCHER','CRM_SALES','TEAM_LEADER','TECHNICIAN','CONTRACTOR','READ_ONLY','MANAGER','STAFF'
   ])
   else false
 end
$$;
revoke all on function public.can_grant_business_role(text,text) from public,anon,authenticated;

create or replace function public.invite_business_member(
  p_business_id uuid,
  p_email text,
  p_member_role text,
  p_display_name text default null,
  p_job_title text default null,
  p_employee_number text default null,
  p_location_id uuid default null,
  p_is_dispatchable boolean default false
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_actor_role text;
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_role text:=upper(trim(coalesce(p_member_role,'')));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select member_role into v_actor_role
  from public.business_members
  where business_id=p_business_id and user_id=v_uid and status='ACTIVE';
  if v_actor_role is null or not public.has_business_permission(p_business_id,'TEAM_MANAGE') then
    raise exception 'Team management permission required';
  end if;
  if not public.can_grant_business_role(v_actor_role,v_role) then
    raise exception 'You cannot grant that role';
  end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'Enter a valid email address'; end if;
  if p_location_id is not null and not exists(
    select 1 from public.business_locations l where l.id=p_location_id and l.business_id=p_business_id and l.active
  ) then raise exception 'Location not available'; end if;
  if exists(
    select 1 from auth.users u
    join public.business_members bm on bm.user_id=u.id and bm.business_id=p_business_id and bm.status='ACTIVE'
    where lower(u.email)=v_email
  ) then raise exception 'This person is already an active member'; end if;

  update public.business_staff_invitations
  set status='EXPIRED',updated_at=now()
  where business_id=p_business_id and lower(email)=v_email and status='PENDING' and expires_at<=now();

  insert into public.business_staff_invitations(
    business_id,email,member_role,display_name,job_title,employee_number,location_id,is_dispatchable,invited_by
  ) values(
    p_business_id,v_email,v_role,nullif(trim(coalesce(p_display_name,'')),''),
    nullif(trim(coalesce(p_job_title,'')),''),
    nullif(trim(coalesce(p_employee_number,'')),''),
    p_location_id,coalesce(p_is_dispatchable,false),v_uid
  )
  on conflict (business_id,lower(email)) where status='PENDING'
  do update set
    member_role=excluded.member_role,
    display_name=excluded.display_name,
    job_title=excluded.job_title,
    employee_number=excluded.employee_number,
    location_id=excluded.location_id,
    is_dispatchable=excluded.is_dispatchable,
    invited_by=v_uid,
    expires_at=now()+interval '14 days',
    updated_at=now()
  returning id into v_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_uid,'BUSINESS_MEMBER_INVITED','BUSINESS',p_business_id,jsonb_build_object('invitation_id',v_id,'role',v_role));
  return v_id;
end
$$;
revoke all on function public.invite_business_member(uuid,text,text,text,text,text,uuid,boolean) from public,anon;
grant execute on function public.invite_business_member(uuid,text,text,text,text,text,uuid,boolean) to authenticated;

create or replace function public.get_my_business_invitations()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id=v_uid;
  if v_email is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',i.id,'business_id',i.business_id,'business_name',b.name,'member_role',i.member_role,
      'display_name',i.display_name,'job_title',i.job_title,'expires_at',i.expires_at
    ) order by i.created_at desc)
    from public.business_staff_invitations i
    join public.businesses b on b.id=i.business_id
    where lower(i.email)=v_email and i.status='PENDING' and i.expires_at>now()
  ),'[]'::jsonb);
end
$$;
revoke all on function public.get_my_business_invitations() from public,anon;
grant execute on function public.get_my_business_invitations() to authenticated;

create or replace function public.accept_business_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  i public.business_staff_invitations;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id=v_uid;
  select * into i from public.business_staff_invitations where id=p_invitation_id for update;
  if i.id is null or i.status<>'PENDING' then raise exception 'Invitation is not available'; end if;
  if i.expires_at<=now() then
    update public.business_staff_invitations set status='EXPIRED',updated_at=now() where id=i.id;
    raise exception 'Invitation expired';
  end if;
  if v_email is null or lower(i.email)<>v_email then raise exception 'This invitation belongs to a different email address'; end if;

  insert into public.business_members(
    business_id,user_id,member_role,status,display_name,job_title,employee_number,location_id,is_dispatchable,created_at,updated_at
  ) values(
    i.business_id,v_uid,i.member_role,'ACTIVE',i.display_name,i.job_title,i.employee_number,i.location_id,i.is_dispatchable,now(),now()
  )
  on conflict (business_id,user_id) do update set
    member_role=excluded.member_role,status='ACTIVE',
    display_name=coalesce(excluded.display_name,public.business_members.display_name),
    job_title=excluded.job_title,employee_number=excluded.employee_number,
    location_id=excluded.location_id,is_dispatchable=excluded.is_dispatchable,updated_at=now();

  update public.business_staff_invitations
  set status='ACCEPTED',accepted_by=v_uid,accepted_at=now(),updated_at=now()
  where id=i.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_uid,'BUSINESS_INVITATION_ACCEPTED','BUSINESS',i.business_id,jsonb_build_object('invitation_id',i.id,'role',i.member_role));
  return i.business_id;
end
$$;
revoke all on function public.accept_business_invitation(uuid) from public,anon;
grant execute on function public.accept_business_invitation(uuid) to authenticated;

create or replace function public.revoke_business_invitation(p_business_id uuid,p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
 if auth.uid() is null or not public.has_business_permission(p_business_id,'TEAM_MANAGE') then raise exception 'Not authorized'; end if;
 update public.business_staff_invitations
 set status='REVOKED',updated_at=now()
 where id=p_invitation_id and business_id=p_business_id and status='PENDING';
 return found;
end
$$;
revoke all on function public.revoke_business_invitation(uuid,uuid) from public,anon;
grant execute on function public.revoke_business_invitation(uuid,uuid) to authenticated;

create or replace function public.update_business_member(
  p_business_id uuid,
  p_user_id uuid,
  p_member_role text,
  p_job_title text default null,
  p_employee_number text default null,
  p_location_id uuid default null,
  p_is_dispatchable boolean default false,
  p_status text default 'ACTIVE'
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_actor_role text;
  v_target_role text;
  v_role text:=upper(trim(coalesce(p_member_role,'')));
  v_status text:=upper(trim(coalesce(p_status,'')));
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select member_role into v_actor_role from public.business_members
 where business_id=p_business_id and user_id=v_uid and status='ACTIVE';
 select member_role into v_target_role from public.business_members
 where business_id=p_business_id and user_id=p_user_id;
 if v_actor_role is null or not public.has_business_permission(p_business_id,'TEAM_MANAGE') then raise exception 'Not authorized'; end if;
 if v_target_role is null then raise exception 'Team member not found'; end if;
 if v_target_role='OWNER' then raise exception 'Business owner cannot be edited here'; end if;
 if v_status not in ('ACTIVE','SUSPENDED') then raise exception 'Invalid member status'; end if;
 if not public.can_grant_business_role(v_actor_role,v_role) then raise exception 'You cannot grant that role'; end if;
 if v_actor_role<>'OWNER' and v_target_role in ('ADMIN','FINANCE') then raise exception 'Only the owner can manage privileged members'; end if;
 if p_location_id is not null and not exists(
   select 1 from public.business_locations l where l.id=p_location_id and l.business_id=p_business_id and l.active
 ) then raise exception 'Location not available'; end if;
 update public.business_members set
   member_role=v_role,job_title=nullif(trim(coalesce(p_job_title,'')),''),
   employee_number=nullif(trim(coalesce(p_employee_number,'')),''),
   location_id=p_location_id,is_dispatchable=coalesce(p_is_dispatchable,false),
   status=v_status,updated_at=now()
 where business_id=p_business_id and user_id=p_user_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(v_uid,'BUSINESS_MEMBER_UPDATED','BUSINESS',p_business_id,jsonb_build_object('user_id',p_user_id,'role',v_role,'status',v_status));
 return found;
end
$$;
revoke all on function public.update_business_member(uuid,uuid,text,text,text,uuid,boolean,text) from public,anon;
grant execute on function public.update_business_member(uuid,uuid,text,text,text,uuid,boolean,text) to authenticated;

create or replace function public.remove_business_member(p_business_id uuid,p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_actor_role text; v_target_role text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select member_role into v_actor_role from public.business_members where business_id=p_business_id and user_id=v_uid and status='ACTIVE';
 select member_role into v_target_role from public.business_members where business_id=p_business_id and user_id=p_user_id;
 if v_actor_role is null or not public.has_business_permission(p_business_id,'TEAM_MANAGE') then raise exception 'Not authorized'; end if;
 if v_target_role is null then return false; end if;
 if v_target_role='OWNER' then raise exception 'Business owner cannot be removed'; end if;
 if v_actor_role<>'OWNER' and v_target_role in ('ADMIN','FINANCE') then raise exception 'Only the owner can remove privileged members'; end if;
 update public.business_members
 set status='REMOVED',is_dispatchable=false,updated_at=now()
 where business_id=p_business_id and user_id=p_user_id;
 update public.business_job_assignments
 set status='CANCELLED',cancelled_at=now(),updated_at=now()
 where business_id=p_business_id and assigned_user_id=p_user_id
   and status not in ('COMPLETED','DECLINED','CANCELLED');
 delete from public.business_team_members where business_id=p_business_id and user_id=p_user_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(v_uid,'BUSINESS_MEMBER_REMOVED','BUSINESS',p_business_id,jsonb_build_object('user_id',p_user_id));
 return found;
end
$$;
revoke all on function public.remove_business_member(uuid,uuid) from public,anon;
grant execute on function public.remove_business_member(uuid,uuid) to authenticated;

-- Permission overrides are owner-only so an admin cannot grant themselves payout or owner powers.
create or replace function public.set_business_member_permission(
  p_business_id uuid,p_user_id uuid,p_permission text,p_allowed boolean
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select member_role into v_role from public.business_members
 where business_id=p_business_id and user_id=auth.uid() and status='ACTIVE';
 if v_role<>'OWNER' then raise exception 'Owner permission required'; end if;
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_user_id and status='ACTIVE') then
   raise exception 'Active member not found';
 end if;
 if upper(p_permission) not in (
   'OPERATIONS_VIEW','TEAM_VIEW','TEAM_MANAGE','JOB_VIEW_ALL','JOB_ASSIGN','JOB_UPDATE_ALL','CRM_VIEW','CRM_MANAGE',
   'INBOX_VIEW_ALL','FINANCE_VIEW','FINANCE_MANAGE','PAYOUTS_MANAGE','CATALOG_MANAGE','ORDERS_VIEW','ORDERS_MANAGE',
   'SETTINGS_MANAGE','ANALYTICS_VIEW'
 ) then raise exception 'Unknown permission'; end if;
 if upper(p_permission)='PAYOUTS_MANAGE' then raise exception 'Payout ownership cannot be delegated'; end if;
 insert into public.business_member_permission_overrides(business_id,user_id,permission,allowed,granted_by)
 values(p_business_id,p_user_id,upper(p_permission),p_allowed,auth.uid())
 on conflict(business_id,user_id,permission) do update set allowed=excluded.allowed,granted_by=auth.uid(),updated_at=now();
 return true;
end
$$;
revoke all on function public.set_business_member_permission(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.set_business_member_permission(uuid,uuid,text,boolean) to authenticated;
