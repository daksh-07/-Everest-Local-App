-- Keep the normalized identity verification status synchronized with the
-- private profile-photo and identity-document review decisions.

create or replace function public.admin_set_driver_document_status(
  p_document_id uuid,p_status text,p_reason text default null
) returns boolean language plpgsql security definer set search_path=public
as $$
declare d public.driver_documents; identity_status text;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_status not in ('UNDER_REVIEW','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED') then raise exception 'Invalid document status'; end if;
  if p_status in ('MORE_INFORMATION_REQUIRED','REJECTED') and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A reason is required'; end if;
  select * into d from public.driver_documents where id=p_document_id for update;
  if d.id is null then raise exception 'Document not found'; end if;

  update public.driver_documents set
    status=p_status,
    rejection_reason=case when p_status in ('MORE_INFORMATION_REQUIRED','REJECTED') then nullif(trim(p_reason),'') else null end,
    verified_at=case when p_status='VERIFIED' then now() else verified_at end,
    verified_by=case when p_status='VERIFIED' then auth.uid() else verified_by end
  where id=d.id;

  if d.document_type in ('PROFILE_PHOTO','IDENTITY_DOCUMENT') then
    if exists(select 1 from public.driver_documents x where x.application_id=d.application_id and x.document_type in ('PROFILE_PHOTO','IDENTITY_DOCUMENT') and x.status='REJECTED') then
      identity_status:='REJECTED';
    elsif exists(select 1 from public.driver_documents x where x.application_id=d.application_id and x.document_type in ('PROFILE_PHOTO','IDENTITY_DOCUMENT') and x.status='MORE_INFORMATION_REQUIRED') then
      identity_status:='MORE_INFORMATION_REQUIRED';
    elsif exists(select 1 from public.driver_documents x where x.application_id=d.application_id and x.document_type='PROFILE_PHOTO' and x.status='VERIFIED')
      and exists(select 1 from public.driver_documents x where x.application_id=d.application_id and x.document_type='IDENTITY_DOCUMENT' and x.status='VERIFIED') then
      identity_status:='VERIFIED';
    else
      identity_status:='PENDING';
    end if;

    update public.driver_verifications set
      identity_status=identity_status,
      updated_at=now()
    where application_id=d.application_id;

    update public.driver_compliance_checks set
      status=identity_status,
      verification_method='MANUAL_REVIEW_REQUIRED',
      reviewer_id=auth.uid(),
      reviewed_at=case when identity_status in ('VERIFIED','REJECTED','MORE_INFORMATION_REQUIRED') then now() else reviewed_at end,
      reason=nullif(trim(p_reason),''),
      updated_at=now()
    where application_id=d.application_id and requirement_code='IDENTITY';
  end if;

  update public.driver_compliance_checks c
    set status=case
      when p_status='VERIFIED' then 'VERIFIED'
      when p_status='MORE_INFORMATION_REQUIRED' then 'MORE_INFORMATION_REQUIRED'
      when p_status='REJECTED' then 'REJECTED'
      else c.status end,
      verification_method=case when p_status='VERIFIED' then 'MANUAL_REVIEW_REQUIRED' else c.verification_method end,
      reviewer_id=case when p_status='VERIFIED' then auth.uid() else c.reviewer_id end,
      reviewed_at=case when p_status='VERIFIED' then now() else c.reviewed_at end,
      reason=nullif(trim(p_reason),''),
      updated_at=now()
  where c.application_id=d.application_id
    and c.requirement_code=case
      when d.document_type in ('PROFILE_PHOTO','IDENTITY_DOCUMENT') then 'IDENTITY'
      when d.document_type in ('LICENCE_FRONT','LICENCE_BACK') then 'LICENCE'
      when d.document_type='REGISTRATION' then 'REGISTRATION'
      when d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') then 'VEHICLE_OWNERSHIP'
      when d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE','VEHICLE_INTERIOR') then 'VEHICLE_PHOTOS'
      when d.document_type='INSURANCE' then 'ADDITIONAL_INSURANCE'
      else c.requirement_code end;

  insert into public.driver_status_history(application_id,actor_id,action,new_status,reason,metadata)
  values(d.application_id,auth.uid(),'DOCUMENT_STATUS_CHANGE',
    (select status from public.driver_applications where id=d.application_id),p_reason,
    jsonb_build_object('document_id',d.id,'document_type',d.document_type,'document_subtype',d.document_subtype,'status',p_status));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_document_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_driver_document_status(uuid,text,text) to authenticated;
