create or replace function public.get_business_operations_dashboard(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_can_team boolean:=public.has_business_permission(p_business_id,'TEAM_VIEW');
  v_can_manage_team boolean:=public.has_business_permission(p_business_id,'TEAM_MANAGE');
  v_can_jobs boolean:=public.has_business_permission(p_business_id,'JOB_VIEW_ALL');
  v_can_assign boolean:=public.has_business_permission(p_business_id,'JOB_ASSIGN');
begin
 if auth.uid() is null or not public.is_active_business_member(p_business_id) then raise exception 'Business access denied'; end if;
 if not (v_can_team or public.has_business_permission(p_business_id,'OPERATIONS_VIEW')) then raise exception 'Operations access denied'; end if;

 return jsonb_build_object(
   'permissions',jsonb_build_object(
     'team_view',v_can_team,'team_manage',v_can_manage_team,'job_view_all',v_can_jobs,'job_assign',v_can_assign
   ),
   'stats',jsonb_build_object(
     'active_staff',(select count(*) from public.business_members where business_id=p_business_id and status='ACTIVE'),
     'dispatchable_staff',(select count(*) from public.business_members where business_id=p_business_id and status='ACTIVE' and is_dispatchable),
     'teams',(select count(*) from public.business_teams where business_id=p_business_id and active),
     'locations',(select count(*) from public.business_locations where business_id=p_business_id and active),
     'active_assignments',(select count(*) from public.business_job_assignments where business_id=p_business_id and status not in ('COMPLETED','DECLINED','CANCELLED'))
   ),
   'members',case when v_can_team then coalesce((
     select jsonb_agg(jsonb_build_object(
       'user_id',bm.user_id,'name',coalesce(nullif(bm.display_name,''),nullif(p.full_name,''),'Team member'),
       'avatar_url',p.avatar_url,'member_role',bm.member_role,'status',bm.status,'job_title',bm.job_title,
       'employee_number',bm.employee_number,'location_id',bm.location_id,'is_dispatchable',bm.is_dispatchable
     ) order by case bm.member_role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end,coalesce(bm.display_name,p.full_name,''))
     from public.business_members bm left join public.profiles p on p.id=bm.user_id
     where bm.business_id=p_business_id and bm.status<>'REMOVED'
   ),'[]'::jsonb) else '[]'::jsonb end,
   'locations',case when v_can_team then coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',l.id,'name',l.name,'suburb',l.suburb,'city',l.city,'state',l.state,'postcode',l.postcode,
       'address_line',l.address_line,'is_primary',l.is_primary,'active',l.active
     ) order by l.is_primary desc,l.name)
     from public.business_locations l where l.business_id=p_business_id and l.active
   ),'[]'::jsonb) else '[]'::jsonb end,
   'teams',case when v_can_team then coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',t.id,'name',t.name,'description',t.description,'location_id',t.location_id,
       'member_count',(select count(*) from public.business_team_members tm where tm.team_id=t.id),
       'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',tm.user_id,'team_role',tm.team_role))
         from public.business_team_members tm where tm.team_id=t.id),'[]'::jsonb)
     ) order by t.name)
     from public.business_teams t where t.business_id=p_business_id and t.active
   ),'[]'::jsonb) else '[]'::jsonb end,
   'invitations',case when v_can_manage_team then coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',i.id,'email',i.email,'member_role',i.member_role,'display_name',i.display_name,'job_title',i.job_title,
       'location_id',i.location_id,'is_dispatchable',i.is_dispatchable,'expires_at',i.expires_at
     ) order by i.created_at desc)
     from public.business_staff_invitations i
     where i.business_id=p_business_id and i.status='PENDING' and i.expires_at>now()
   ),'[]'::jsonb) else '[]'::jsonb end,
   'unassigned_jobs',case when v_can_jobs or v_can_assign then (
     coalesce((
       select jsonb_agg(x order by x->>'sort_at') from (
         select jsonb_build_object(
           'source','EVEREST','booking_id',b.id,'crm_booking_id',null,'label',coalesce(s.name,'Everest service'),
           'customer_name',coalesce(p.full_name,'Customer'),
           'scheduled_at',case when b.scheduled_date is null then null else (b.scheduled_date::text||'T'||coalesce(b.scheduled_time::text,'00:00:00')) end,
           'sort_at',coalesce(b.scheduled_date::text||'T'||coalesce(b.scheduled_time::text,'00:00:00'),b.created_at::text),
           'location',coalesce(r.service_address_label,concat_ws(', ',r.suburb,r.city,r.state)),
           'status',b.status::text
         ) x
         from public.bookings b
         left join public.service_requests r on r.id=b.request_id
         left join public.services s on s.id=r.service_id
         left join public.profiles p on p.id=b.customer_id
         where b.business_id=p_business_id
           and b.status in ('CONFIRMED','UPCOMING','IN_PROGRESS')
           and not exists(select 1 from public.business_job_assignments a where a.booking_id=b.id and a.status not in ('DECLINED','CANCELLED'))
         union all
         select jsonb_build_object(
           'source','CRM','booking_id',null,'crm_booking_id',cb.id,'label',cb.service_label,
           'customer_name',coalesce(c.display_name,'Customer'),'scheduled_at',cb.scheduled_start,
           'sort_at',cb.scheduled_start::text,'location',cb.location_label,'status',cb.status
         ) x
         from public.crm_bookings cb
         join public.business_contacts c on c.id=cb.contact_id
         where cb.business_id=p_business_id
           and cb.status in ('TENTATIVE','CONFIRMED','IN_PROGRESS')
           and not exists(select 1 from public.business_job_assignments a where a.crm_booking_id=cb.id and a.status not in ('DECLINED','CANCELLED'))
       ) jobs
     ),'[]'::jsonb)
   ) else '[]'::jsonb end,
   'assignments',case when v_can_jobs or v_can_assign then coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',a.id,'booking_id',a.booking_id,'crm_booking_id',a.crm_booking_id,'assigned_user_id',a.assigned_user_id,
       'team_id',a.team_id,'status',a.status,'note',a.note,'updated_at',a.updated_at,
       'assignee_name',coalesce(bm.display_name,p.full_name,t.name,'Team')
     ) order by a.updated_at desc)
     from public.business_job_assignments a
     left join public.business_members bm on bm.business_id=a.business_id and bm.user_id=a.assigned_user_id
     left join public.profiles p on p.id=a.assigned_user_id
     left join public.business_teams t on t.id=a.team_id and t.business_id=a.business_id
     where a.business_id=p_business_id and a.status not in ('COMPLETED','DECLINED','CANCELLED')
   ),'[]'::jsonb) else '[]'::jsonb end
 );
end
$$;
revoke all on function public.get_business_operations_dashboard(uuid) from public,anon;
grant execute on function public.get_business_operations_dashboard(uuid) to authenticated;

create or replace function public.get_my_assigned_jobs(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_active_business_member(p_business_id) then raise exception 'Business access denied'; end if;
 return coalesce((
   select jsonb_agg(job order by job->>'sort_at')
   from (
     select jsonb_build_object(
       'assignment_id',a.id,'source','EVEREST','booking_id',a.booking_id,'crm_booking_id',null,
       'status',a.status,'job_status',b.status::text,
       'label',coalesce(s.name,'Everest service'),'customer_name',coalesce(p.full_name,'Customer'),
       'scheduled_at',case when b.scheduled_date is null then null else (b.scheduled_date::text||'T'||coalesce(b.scheduled_time::text,'00:00:00')) end,
       'sort_at',coalesce(b.scheduled_date::text||'T'||coalesce(b.scheduled_time::text,'00:00:00'),b.created_at::text),
       'location',coalesce(r.service_address_label,concat_ws(', ',r.address_line1,r.suburb,r.city,r.state,r.postal_code)),
       'price',b.price,'team_id',a.team_id,'note',a.note
     ) job
     from public.business_job_assignments a
     join public.bookings b on b.id=a.booking_id and b.business_id=a.business_id
     left join public.service_requests r on r.id=b.request_id
     left join public.services s on s.id=r.service_id
     left join public.profiles p on p.id=b.customer_id
     where a.business_id=p_business_id
       and a.status not in ('DECLINED','CANCELLED')
       and (
         public.has_business_permission(p_business_id,'JOB_VIEW_ALL')
         or a.assigned_user_id=auth.uid()
         or exists(select 1 from public.business_team_members tm where tm.business_id=a.business_id and tm.team_id=a.team_id and tm.user_id=auth.uid())
       )
     union all
     select jsonb_build_object(
       'assignment_id',a.id,'source','CRM','booking_id',null,'crm_booking_id',a.crm_booking_id,
       'status',a.status,'job_status',cb.status,'label',cb.service_label,'customer_name',coalesce(c.display_name,'Customer'),
       'scheduled_at',cb.scheduled_start,'sort_at',cb.scheduled_start::text,'location',cb.location_label,
       'price',cb.price,'team_id',a.team_id,'note',a.note
     ) job
     from public.business_job_assignments a
     join public.crm_bookings cb on cb.id=a.crm_booking_id and cb.business_id=a.business_id
     join public.business_contacts c on c.id=cb.contact_id and c.business_id=a.business_id
     where a.business_id=p_business_id
       and a.status not in ('DECLINED','CANCELLED')
       and (
         public.has_business_permission(p_business_id,'JOB_VIEW_ALL')
         or a.assigned_user_id=auth.uid()
         or exists(select 1 from public.business_team_members tm where tm.business_id=a.business_id and tm.team_id=a.team_id and tm.user_id=auth.uid())
       )
   ) jobs
 ),'[]'::jsonb);
end
$$;
revoke all on function public.get_my_assigned_jobs(uuid) from public,anon;
grant execute on function public.get_my_assigned_jobs(uuid) to authenticated;
