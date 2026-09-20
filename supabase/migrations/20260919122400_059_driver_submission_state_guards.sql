-- Prevent terminal or draft applications from being submitted/approved through
-- direct RPC calls. Re-verification after EXPIRED/REJECTED remains supported.

create or replace function public.submit_driver_application()
returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; req_count integer; declaration_count integer;
begin
  select * into a from public.driver_applications where user_id=auth.uid() for update;
  if a.id is null then raise exception 'Complete your driver application first'; end if;
  if a.status in ('APPROVED','SUSPENDED') then raise exception 'This application is not accepting a new submission'; end if;
  if length(coalesce(a.legal_first_name,''))<2 or length(coalesce(a.legal_last_name,''))<2 or a.date_of_birth is null then raise exception 'Complete your legal personal details'; end if;
  if length(coalesce(a.address_line,''))<3 or length(coalesce(a.suburb,''))<2 or length(coalesce(a.city,''))<2 or length(coalesce(a.state,''))<2 then raise exception 'Complete your residential address'; end if;
  if not exists(select 1 from public.driver_vehicles where application_id=a.id) then raise exception 'Add a vehicle before submitting'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='IDENTITY_DOCUMENT' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload an identity document'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Add a profile photo for identity review'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload the front of your driver licence'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='REGISTRATION' and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload registration evidence'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload vehicle ownership or authorisation evidence'; end if;
  if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE') and d.status in ('SUBMITTED','UNDER_REVIEW','VERIFIED')) then raise exception 'Upload a vehicle photo'; end if;
  select count(*) into declaration_count from public.driver_declaration_templates t
    where t.required=true and t.active=true
      and exists(select 1 from public.driver_declarations d where d.application_id=a.id and d.declaration_key=t.declaration_key and d.declaration_version=t.version);
  select count(*) into req_count from public.driver_declaration_templates where required=true and active=true;
  if declaration_count<>req_count then raise exception 'Accept all required declarations before submitting'; end if;
  if not exists(select 1 from public.driver_compliance_requirements where jurisdiction_code=a.compliance_jurisdiction and active=true) then
    raise exception 'Compliance jurisdiction is not configured for this application';
  end if;
  update public.driver_applications set status='SUBMITTED',last_submitted_at=now(),submitted_at=now(),status_reason=null,updated_at=now() where id=a.id;
  insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status) values(a.id,auth.uid(),'APPLICATION_SUBMITTED',a.status,'SUBMITTED');
  insert into public.notifications(user_id,kind,title,body,data) values(auth.uid(),'DRIVER_APPLICATION_SUBMITTED','Driver application submitted','Your Everest driver application is now waiting for review.',jsonb_build_object('application_id',a.id));
  return true;
end;
$$;
revoke execute on function public.submit_driver_application() from public,anon;
grant execute on function public.submit_driver_application() to authenticated;

create or replace function public.admin_set_driver_application(
  p_application_id uuid,p_status text,p_notes text default null
) returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; prev text; reason text; compliance jsonb;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  reason:=nullif(trim(coalesce(p_notes,'')),'');
  if p_status not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED','SUSPENDED') then raise exception 'Invalid driver application status'; end if;
  if p_status in ('MORE_INFORMATION_REQUIRED','REJECTED','SUSPENDED') and reason is null then raise exception 'A reason is required for this action'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  prev:=a.status;
  if p_status='APPROVED' then
    if a.status not in ('SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then
      raise exception 'Only a submitted or re-verification application can be approved';
    end if;
    compliance:=public.evaluate_driver_compliance(a.id);
    if jsonb_array_length(compliance->'overall'->'blockingItems')>0 then
      raise exception 'Driver compliance checklist is incomplete: %', compliance->'overall'->'blockingItems';
    end if;
  end if;
  update public.driver_applications set
    status=p_status,
    status_reason=case when p_status in ('MORE_INFORMATION_REQUIRED','REJECTED','SUSPENDED') then reason else null end,
    reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
  where id=a.id;
  insert into public.driver_status_history(application_id,actor_id,action,previous_status,new_status,reason)
  values(a.id,auth.uid(),'ADMIN_STATUS_CHANGE',prev,p_status,reason);
  insert into public.admin_actions(admin_id,action,target_type,target_id,metadata)
  values(auth.uid(),'driver_application_status','driver_application',a.id,jsonb_build_object('previous_status',prev,'status',p_status,'reason',reason));
  insert into public.notifications(user_id,kind,title,body,data)
  values(a.user_id,'DRIVER_APPLICATION_STATUS',
    case when p_status='APPROVED' then 'Driver application approved'
         when p_status='MORE_INFORMATION_REQUIRED' then 'Action required for your driver application'
         when p_status='REJECTED' then 'Driver application update'
         when p_status='SUSPENDED' then 'Driver account suspended'
         else 'Driver application under review' end,
    case when p_status='APPROVED' then 'Your verification is complete. Driver access is now available when your credentials remain valid.'
         when p_status='MORE_INFORMATION_REQUIRED' then 'Everest needs more information before your application can be approved.'
         else coalesce(reason,'Your driver application status has been updated.') end,
    jsonb_build_object('application_id',a.id,'status',p_status)
  );
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_application(uuid,text,text) from public,anon;
grant execute on function public.admin_set_driver_application(uuid,text,text) to authenticated;
