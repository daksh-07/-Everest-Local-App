-- ---------- STRUCTURE / ASSIGNMENT RPCS ----------

create or replace function public.create_business_location(
  p_business_id uuid,p_name text,p_address_line text default null,p_suburb text default null,
  p_city text default null,p_state text default null,p_postcode text default null,p_country text default 'Australia',
  p_timezone text default 'Australia/Sydney',p_is_primary boolean default false
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.has_business_permission(p_business_id,'TEAM_MANAGE') then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_name,'')))<1 then raise exception 'Location name is required'; end if;
 if p_is_primary then update public.business_locations set is_primary=false,updated_at=now() where business_id=p_business_id and is_primary; end if;
 insert into public.business_locations(
   business_id,name,address_line,suburb,city,state,postcode,country,timezone,is_primary,created_by
 ) values(
   p_business_id,trim(p_name),nullif(trim(coalesce(p_address_line,'')),''),
   nullif(trim(coalesce(p_suburb,'')),''),nullif(trim(coalesce(p_city,'')),''),
   nullif(trim(coalesce(p_state,'')),''),nullif(trim(coalesce(p_postcode,'')),''),
   coalesce(nullif(trim(coalesce(p_country,'')),''),'Australia'),
   coalesce(nullif(trim(coalesce(p_timezone,'')),''),'Australia/Sydney'),coalesce(p_is_primary,false),auth.uid()
 ) returning id into v_id;
 return v_id;
end
$$;
revoke all on function public.create_business_location(uuid,text,text,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.create_business_location(uuid,text,text,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.create_business_team(
  p_business_id uuid,p_name text,p_description text default null,p_location_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.has_business_permission(p_business_id,'TEAM_MANAGE') then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_name,'')))<1 then raise exception 'Team name is required'; end if;
 if p_location_id is not null and not exists(
   select 1 from public.business_locations where id=p_location_id and business_id=p_business_id and active
 ) then raise exception 'Location not available'; end if;
 insert into public.business_teams(business_id,name,description,location_id,created_by)
 values(p_business_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_location_id,auth.uid())
 returning id into v_id;
 return v_id;
end
$$;
revoke all on function public.create_business_team(uuid,text,text,uuid) from public,anon;
grant execute on function public.create_business_team(uuid,text,text,uuid) to authenticated;

create or replace function public.set_business_team_member(
  p_business_id uuid,p_team_id uuid,p_user_id uuid,p_team_role text default 'MEMBER',p_enabled boolean default true
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_team_role text:=upper(coalesce(p_team_role,'MEMBER'));
begin
 if auth.uid() is null or not public.has_business_permission(p_business_id,'TEAM_MANAGE') then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.business_teams where id=p_team_id and business_id=p_business_id and active) then raise exception 'Team not available'; end if;
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_user_id and status='ACTIVE') then raise exception 'Active member not found'; end if;
 if v_team_role not in ('LEAD','MEMBER') then raise exception 'Invalid team role'; end if;
 if p_enabled then
   insert into public.business_team_members(business_id,team_id,user_id,team_role)
   values(p_business_id,p_team_id,p_user_id,v_team_role)
   on conflict(team_id,user_id) do update set team_role=excluded.team_role;
 else
   delete from public.business_team_members where business_id=p_business_id and team_id=p_team_id and user_id=p_user_id;
 end if;
 return true;
end
$$;
revoke all on function public.set_business_team_member(uuid,uuid,uuid,text,boolean) from public,anon;
grant execute on function public.set_business_team_member(uuid,uuid,uuid,text,boolean) to authenticated;

create or replace function public.assign_business_job(
  p_business_id uuid,
  p_booking_id uuid default null,
  p_crm_booking_id uuid default null,
  p_assigned_user_id uuid default null,
  p_team_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.has_business_permission(p_business_id,'JOB_ASSIGN') then raise exception 'Dispatch permission required'; end if;
 if num_nonnulls(p_booking_id,p_crm_booking_id)<>1 then raise exception 'Choose exactly one job'; end if;
 if num_nonnulls(p_assigned_user_id,p_team_id)<>1 then raise exception 'Choose a person or team'; end if;

 if p_booking_id is not null and not exists(
   select 1 from public.bookings where id=p_booking_id and business_id=p_business_id and status not in ('COMPLETED','CANCELLED')
 ) then raise exception 'Marketplace booking is not assignable'; end if;
 if p_crm_booking_id is not null and not exists(
   select 1 from public.crm_bookings where id=p_crm_booking_id and business_id=p_business_id and status not in ('COMPLETED','CANCELLED','NO_SHOW')
 ) then raise exception 'CRM booking is not assignable'; end if;
 if p_assigned_user_id is not null and not exists(
   select 1 from public.business_members
   where business_id=p_business_id and user_id=p_assigned_user_id and status='ACTIVE'
 ) then raise exception 'Employee is not active'; end if;
 if p_team_id is not null and not exists(
   select 1 from public.business_teams where business_id=p_business_id and id=p_team_id and active
 ) then raise exception 'Team is not active'; end if;

 update public.business_job_assignments set
   status='CANCELLED',cancelled_at=now(),updated_at=now()
 where business_id=p_business_id
   and status not in ('DECLINED','CANCELLED','COMPLETED')
   and ((p_booking_id is not null and booking_id=p_booking_id) or (p_crm_booking_id is not null and crm_booking_id=p_crm_booking_id));

 insert into public.business_job_assignments(
   business_id,booking_id,crm_booking_id,assigned_user_id,team_id,assigned_by,note
 ) values(
   p_business_id,p_booking_id,p_crm_booking_id,p_assigned_user_id,p_team_id,auth.uid(),
   nullif(trim(coalesce(p_note,'')),'')
 ) returning id into v_id;

 if p_crm_booking_id is not null then
   update public.crm_bookings set assigned_user_id=p_assigned_user_id,updated_at=now()
   where id=p_crm_booking_id and business_id=p_business_id;
 end if;

 insert into public.business_job_events(business_id,assignment_id,booking_id,crm_booking_id,actor_id,kind,detail)
 values(p_business_id,v_id,p_booking_id,p_crm_booking_id,auth.uid(),'ASSIGNED',
   jsonb_build_object('assigned_user_id',p_assigned_user_id,'team_id',p_team_id));
 return v_id;
end
$$;
revoke all on function public.assign_business_job(uuid,uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.assign_business_job(uuid,uuid,uuid,uuid,uuid,text) to authenticated;

create or replace function public.update_business_job_assignment_status(p_assignment_id uuid,p_status text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare a public.business_job_assignments; v_status text:=upper(coalesce(p_status,'')); v_own boolean:=false; v_allowed boolean:=false;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into a from public.business_job_assignments where id=p_assignment_id for update;
 if a.id is null then raise exception 'Assignment not found'; end if;
 v_own:=a.assigned_user_id=auth.uid() or exists(
   select 1 from public.business_team_members tm
   join public.business_members bm on bm.business_id=tm.business_id and bm.user_id=tm.user_id and bm.status='ACTIVE'
   where tm.business_id=a.business_id and tm.team_id=a.team_id and tm.user_id=auth.uid()
 );
 if not (v_own or public.has_business_permission(a.business_id,'JOB_UPDATE_ALL') or public.is_admin()) then raise exception 'Not authorized'; end if;
 if v_status not in ('ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','DECLINED','CANCELLED') then raise exception 'Invalid assignment status'; end if;

 if public.has_business_permission(a.business_id,'JOB_UPDATE_ALL') or public.is_admin() then
   v_allowed:=true;
 elsif v_own then
   v_allowed:=
     (a.status='ASSIGNED' and v_status in ('ACCEPTED','DECLINED'))
     or (a.status='ACCEPTED' and v_status='EN_ROUTE')
     or (a.status='EN_ROUTE' and v_status='ARRIVED')
     or (a.status='ARRIVED' and v_status='IN_PROGRESS')
     or (a.status='IN_PROGRESS' and v_status='COMPLETED');
 end if;
 if not v_allowed then raise exception 'Invalid assignment transition'; end if;

 update public.business_job_assignments set
   status=v_status,
   accepted_at=case when v_status='ACCEPTED' then coalesce(accepted_at,now()) else accepted_at end,
   en_route_at=case when v_status='EN_ROUTE' then coalesce(en_route_at,now()) else en_route_at end,
   arrived_at=case when v_status='ARRIVED' then coalesce(arrived_at,now()) else arrived_at end,
   started_at=case when v_status='IN_PROGRESS' then coalesce(started_at,now()) else started_at end,
   completed_at=case when v_status='COMPLETED' then coalesce(completed_at,now()) else completed_at end,
   cancelled_at=case when v_status in ('DECLINED','CANCELLED') then coalesce(cancelled_at,now()) else cancelled_at end,
   updated_at=now()
 where id=a.id;

 if a.booking_id is not null then
   if v_status='EN_ROUTE' then
     update public.bookings set status='UPCOMING',updated_at=now()
     where id=a.booking_id and status='CONFIRMED';
   elsif v_status='IN_PROGRESS' then
     update public.bookings set status='IN_PROGRESS',updated_at=now()
     where id=a.booking_id and status in ('UPCOMING','IN_PROGRESS');
   elsif v_status='COMPLETED' then
     update public.bookings set status='COMPLETED',completed_at=coalesce(completed_at,now()),updated_at=now()
     where id=a.booking_id and status in ('IN_PROGRESS','COMPLETED');
   end if;

   if v_status in ('EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED') then
     insert into public.booking_job_records(
       booking_id,business_id,customer_id,arrival_status,started_at,completed_at
     )
     select b.id,b.business_id,b.customer_id,
       case v_status when 'EN_ROUTE' then 'ON_MY_WAY' when 'ARRIVED' then 'ARRIVED'
         when 'IN_PROGRESS' then 'IN_PROGRESS' else 'COMPLETED' end,
       case when v_status in ('IN_PROGRESS','COMPLETED') then now() end,
       case when v_status='COMPLETED' then now() end
     from public.bookings b where b.id=a.booking_id
     on conflict(booking_id) do update set
       arrival_status=excluded.arrival_status,
       started_at=coalesce(public.booking_job_records.started_at,excluded.started_at),
       completed_at=coalesce(excluded.completed_at,public.booking_job_records.completed_at),
       updated_at=now();
   end if;
 elsif a.crm_booking_id is not null then
   if v_status='IN_PROGRESS' then
     update public.crm_bookings set status='IN_PROGRESS',updated_at=now()
     where id=a.crm_booking_id and status in ('TENTATIVE','CONFIRMED','IN_PROGRESS');
   elsif v_status='COMPLETED' then
     update public.crm_bookings set status='COMPLETED',completed_at=coalesce(completed_at,now()),updated_at=now()
     where id=a.crm_booking_id and status in ('IN_PROGRESS','COMPLETED');
   end if;
 end if;

 insert into public.business_job_events(business_id,assignment_id,booking_id,crm_booking_id,actor_id,kind,detail)
 values(a.business_id,a.id,a.booking_id,a.crm_booking_id,auth.uid(),v_status,'{}'::jsonb);
 return true;
end
$$;
revoke all on function public.update_business_job_assignment_status(uuid,text) from public,anon;
grant execute on function public.update_business_job_assignment_status(uuid,text) to authenticated;

