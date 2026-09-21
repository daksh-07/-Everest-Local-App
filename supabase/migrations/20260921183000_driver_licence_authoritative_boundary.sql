-- Server-side boundary for authoritative NSW driver licence results.
-- TfNSW access is not configured in this project yet. No government endpoint,
-- credential, or fake verification response is introduced here.

create or replace function public.begin_driver_licence_verification(p_application_id uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; v public.driver_verifications; c public.driver_compliance_checks; request_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Server-side verification boundary required'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  if a.compliance_jurisdiction<>'AU-NSW' then raise exception 'NSW Driver Licence Check is only configured for AU-NSW'; end if;
  select * into v from public.driver_verifications where application_id=a.id for update;
  if v.application_id is null or nullif(trim(coalesce(v.licence_number,'')),'') is null then raise exception 'Driver licence details are incomplete'; end if;
  select * into c from public.driver_compliance_checks where application_id=a.id and requirement_code='LICENCE' for update;
  if c.application_id is null then raise exception 'Licence compliance check is not configured'; end if;
  if c.status='PENDING' and c.verification_method='OFFICIAL_API' and c.verification_provider='TFNSW_DRIVER_LICENCE_CHECK'
     and c.updated_at>now()-interval '5 minutes' and nullif(c.verification_reference,'') is not null then
    return c.verification_reference::uuid;
  end if;
  request_id:=gen_random_uuid();
  update public.driver_compliance_checks set status='PENDING',verification_method='OFFICIAL_API',
    verification_provider='TFNSW_DRIVER_LICENCE_CHECK',verification_reference=request_id::text,
    reviewer_id=null,reviewed_at=null,expires_at=null,reason=null,
    metadata=jsonb_build_object('request_id',request_id,'submitted_at',now(),'source','authoritative_provider_request'),updated_at=now()
  where application_id=a.id and requirement_code='LICENCE';
  update public.driver_verifications set verification_method='OFFICIAL_API',
    verification_provider='TFNSW_DRIVER_LICENCE_CHECK',verification_reference=request_id::text,
    licence_verified_at=null,licence_verified_by=null,updated_at=now()
  where application_id=a.id;
  insert into public.driver_status_history(application_id,action,new_status,metadata)
  values(a.id,'DRIVER_LICENCE_VERIFICATION_SUBMITTED',a.status,jsonb_build_object('provider','TFNSW_DRIVER_LICENCE_CHECK','request_id',request_id));
  return request_id;
end;
$$;
revoke execute on function public.begin_driver_licence_verification(uuid) from public,anon,authenticated;
grant execute on function public.begin_driver_licence_verification(uuid) to service_role;

create or replace function public.apply_driver_licence_authoritative_result(
  p_application_id uuid,p_outcome text,p_provider text,p_reference text,
  p_licence_class text default null,p_licence_expiry date default null,
  p_identity_match text default 'NOT_PROVIDED',p_reason text default null
) returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications; result_status text; safe_reason text; event_action text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Server-side verification boundary required'; end if;
  if p_provider<>'TFNSW_DRIVER_LICENCE_CHECK' then raise exception 'Unsupported licence provider'; end if;
  if p_outcome not in ('VERIFIED','EXPIRED','SUSPENDED','CANCELLED','INVALID','INSUFFICIENT_CLASS','IDENTITY_MISMATCH','RETRY','MANUAL_REVIEW') then raise exception 'Unsupported authoritative licence outcome'; end if;
  if p_identity_match not in ('MATCH','MISMATCH','NOT_PROVIDED') then raise exception 'Unsupported identity match state'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;

  if p_outcome='VERIFIED' and p_identity_match='MISMATCH' then
    result_status:='MORE_INFORMATION_REQUIRED'; safe_reason:='The authoritative licence result could not be confidently matched to the applicant. Manual review is required.'; event_action:='DRIVER_LICENCE_MANUAL_REVIEW_REQUESTED';
  elsif p_outcome='VERIFIED' and (p_licence_expiry is null or p_licence_expiry<current_date) then
    result_status:='EXPIRED'; safe_reason:='The authoritative licence result reports an expired or non-current licence.'; event_action:='DRIVER_LICENCE_AUTO_REJECTED';
  elsif p_outcome='VERIFIED' then
    result_status:='VERIFIED'; safe_reason:=null; event_action:='DRIVER_LICENCE_AUTO_VERIFIED';
  elsif p_outcome='EXPIRED' then
    result_status:='EXPIRED'; safe_reason:='The authoritative service reports that the driver licence is expired.'; event_action:='DRIVER_LICENCE_AUTO_REJECTED';
  elsif p_outcome='SUSPENDED' then
    result_status:='REJECTED'; safe_reason:='The authoritative service reports that the driver licence is suspended.'; event_action:='DRIVER_LICENCE_AUTO_REJECTED';
  elsif p_outcome='CANCELLED' then
    result_status:='REJECTED'; safe_reason:='The authoritative service reports that the driver licence is cancelled or revoked.'; event_action:='DRIVER_LICENCE_AUTO_REJECTED';
  elsif p_outcome='INSUFFICIENT_CLASS' then
    result_status:='REJECTED'; safe_reason:='The authoritative service reports that the licence class is insufficient for the required driving activity.'; event_action:='DRIVER_LICENCE_AUTO_REJECTED';
  elsif p_outcome='INVALID' then
    result_status:='REJECTED'; safe_reason:='The authoritative service could not validate the submitted driver licence.'; event_action:='DRIVER_LICENCE_AUTO_REJECTED';
  elsif p_outcome='IDENTITY_MISMATCH' then
    result_status:='MORE_INFORMATION_REQUIRED'; safe_reason:='The authoritative licence result could not be confidently matched to the applicant. Manual review is required.'; event_action:='DRIVER_LICENCE_MANUAL_REVIEW_REQUESTED';
  elsif p_outcome='MANUAL_REVIEW' then
    result_status:='MORE_INFORMATION_REQUIRED'; safe_reason:='The authoritative result requires manual review.'; event_action:='DRIVER_LICENCE_MANUAL_REVIEW_REQUESTED';
  else
    result_status:='PENDING'; safe_reason:='The government verification service could not complete the check. Please try again shortly.'; event_action:='DRIVER_LICENCE_VERIFICATION_RETRY';
  end if;

  update public.driver_verifications set licence_status=result_status,
    licence_class=coalesce(nullif(trim(p_licence_class),''),licence_class),
    licence_expiry=coalesce(p_licence_expiry,licence_expiry),
    verification_method='OFFICIAL_API',verification_provider=p_provider,
    verification_reference=nullif(trim(p_reference),''),
    licence_verified_at=case when result_status in ('VERIFIED','REJECTED','EXPIRED','MORE_INFORMATION_REQUIRED') then now() else null end,
    licence_verified_by=null,notes=case when safe_reason is null then notes else safe_reason end,updated_at=now()
  where application_id=a.id;

  update public.driver_compliance_checks set status=result_status,verification_method='OFFICIAL_API',
    verification_provider=p_provider,verification_reference=nullif(trim(p_reference),''),
    reviewer_id=null,reviewed_at=case when result_status in ('VERIFIED','REJECTED','EXPIRED','MORE_INFORMATION_REQUIRED') then now() else null end,
    expires_at=case when result_status='VERIFIED' then p_licence_expiry else null end,reason=safe_reason,
    metadata=jsonb_build_object('provider',p_provider,'reference',nullif(trim(p_reference),''),'outcome',p_outcome,'identity_match',p_identity_match,'class',nullif(trim(p_licence_class),''),'checked_at',now()),updated_at=now()
  where application_id=a.id and requirement_code='LICENCE';

  insert into public.driver_status_history(application_id,action,new_status,reason,metadata)
  values(a.id,event_action,a.status,safe_reason,jsonb_build_object('provider',p_provider,'reference',nullif(trim(p_reference),''),'outcome',p_outcome,'identity_match',p_identity_match,'class',nullif(trim(p_licence_class),'')));

  if p_outcome='VERIFIED' and result_status='VERIFIED' then
    insert into public.driver_status_history(application_id,action,new_status,metadata)
    values(a.id,'DRIVER_LICENCE_VERIFICATION_SUCCESS',a.status,jsonb_build_object('provider',p_provider,'reference',nullif(trim(p_reference),''),'identity_match',p_identity_match));
  end if;
  return true;
end;
$$;
revoke execute on function public.apply_driver_licence_authoritative_result(uuid,text,text,text,text,date,text,text) from public,anon,authenticated;
grant execute on function public.apply_driver_licence_authoritative_result(uuid,text,text,text,text,date,text,text) to service_role;

-- Manual admin review can never be labelled as an official API verification.
create or replace function public.admin_set_driver_credential_details(
  p_application_id uuid,p_licence_status text,p_licence_expiry date,
  p_insurance_status text,p_insurance_provider text,p_insurance_policy_reference text,
  p_insurance_type text,p_insurance_expiry date,
  p_verification_method text default 'MANUAL_ADMIN_CHECK',p_provider text default null,p_reference text default null
) returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.driver_applications;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_licence_status not in ('PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid licence status'; end if;
  if p_insurance_status not in ('NOT_REQUIRED','PENDING','VERIFIED','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED') then raise exception 'Invalid insurance status'; end if;
  if p_verification_method<>'MANUAL_ADMIN_CHECK' then raise exception 'Official API results can only be recorded by the trusted verification service'; end if;
  if p_insurance_type is not null and p_insurance_type not in ('CTP','ADDITIONAL_MOTOR','COMMERCIAL_BUSINESS_USE','OTHER') then raise exception 'Invalid insurance type'; end if;
  if p_licence_status='VERIFIED' and (p_licence_expiry is null or p_licence_expiry<current_date) then raise exception 'A verified licence must have a current expiry date'; end if;
  if p_insurance_status='VERIFIED' and (p_insurance_expiry is null or p_insurance_expiry<current_date) then raise exception 'Verified insurance must have a current expiry date'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;
  insert into public.driver_verifications(application_id) values(a.id) on conflict do nothing;
  update public.driver_verifications set licence_status=p_licence_status,licence_expiry=p_licence_expiry,
    insurance_status=p_insurance_status,insurance_provider=nullif(trim(coalesce(p_insurance_provider,'')),''),
    insurance_policy_reference=nullif(trim(coalesce(p_insurance_policy_reference,'')),''),
    insurance_type=nullif(trim(coalesce(p_insurance_type,'')),''),
    insurance_expiry=p_insurance_expiry,verification_method='MANUAL_ADMIN_CHECK',
    verification_provider=null,verification_reference=null,updated_at=now()
  where application_id=a.id;
  update public.driver_compliance_checks set status=p_licence_status,verification_method='MANUAL_REVIEW_REQUIRED',
    verification_provider=null,verification_reference=null,reviewer_id=auth.uid(),
    reviewed_at=case when p_licence_status in ('VERIFIED','REJECTED','MORE_INFORMATION_REQUIRED','EXPIRED') then now() else reviewed_at end,
    expires_at=p_licence_expiry,reason=null,updated_at=now()
  where application_id=a.id and requirement_code='LICENCE';
  insert into public.driver_status_history(application_id,actor_id,action,new_status,metadata)
  values(a.id,auth.uid(),'CREDENTIAL_VERIFICATION_UPDATED',a.status,jsonb_build_object('licence_status',p_licence_status,'licence_expiry',p_licence_expiry,'method','MANUAL_ADMIN_CHECK'));
  return true;
end;
$$;
revoke execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,text,date,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,date,text,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_driver_compliance(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.driver_applications; v public.driver_verifications; dv public.driver_vehicles;
  jurisdiction text; blocking jsonb:='[]'::jsonb; expires_soon jsonb:='[]'::jsonb;
  identity_status text:='PENDING'; licence_status text:='PENDING'; vehicle_status text:='PENDING';
  registration_status text:='PENDING'; ctp_status text:='PENDING'; insurance_status text:='NOT_REQUIRED';
  source_identity jsonb:='{}'::jsonb; source_licence jsonb:='{}'::jsonb;
  source_registration jsonb:='{}'::jsonb; source_ctp jsonb:='{}'::jsonb; source_vehicle jsonb:='{}'::jsonb; source_insurance jsonb:='{}'::jsonb;
  req record; doc record; days integer; overall_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into a from public.driver_applications where id=p_application_id;
  if a.id is null then raise exception 'Driver application not found'; end if;
  if a.user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  jurisdiction:=a.compliance_jurisdiction;
  if not exists(select 1 from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and active=true) then
    blocking:=blocking||jsonb_build_array('COMPLIANCE_JURISDICTION_NOT_CONFIGURED');
  else
    insert into public.driver_compliance_checks(application_id,jurisdiction_code,requirement_code)
    select a.id,jurisdiction,r.requirement_code
    from public.driver_compliance_requirements r
    where r.jurisdiction_code=jurisdiction and r.active=true
    on conflict do nothing;
  end if;
  select * into v from public.driver_verifications where application_id=a.id;
  select * into dv from public.driver_vehicles where application_id=a.id;

  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_identity from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='IDENTITY' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_licence from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='LICENCE' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_registration from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='REGISTRATION' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_ctp from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='CTP' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_vehicle from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='VEHICLE_OWNERSHIP' and active=true;
  select jsonb_build_object('source',source_type,'name',source_name,'url',nullif(source_url,''),'notes',source_notes)
    into source_insurance from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='ADDITIONAL_INSURANCE' and active=true;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='IDENTITY'),false) then
    if v.identity_status='VERIFIED'
       and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status='VERIFIED')
       and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='IDENTITY_DOCUMENT' and d.status='VERIFIED')
    then identity_status:='VERIFIED';
    elsif v.identity_status='REJECTED' then identity_status:='REJECTED';
    elsif v.identity_status='MORE_INFORMATION_REQUIRED' or exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('PROFILE_PHOTO','IDENTITY_DOCUMENT') and d.status='MORE_INFORMATION_REQUIRED') then identity_status:='MORE_INFORMATION_REQUIRED';
    else identity_status:='PENDING'; end if;
  else identity_status:='NOT_REQUIRED'; end if;

  if identity_status<>'VERIFIED' and identity_status<>'NOT_REQUIRED' then
    blocking:=blocking||jsonb_build_array('IDENTITY');
  end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='LICENCE'),false) then
    if v.licence_expiry is not null and v.licence_expiry<current_date then licence_status:='EXPIRED';
    elsif v.licence_status='VERIFIED' and (v.verification_method='OFFICIAL_API' or exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status='VERIFIED' and coalesce(d.expires_at,v.licence_expiry)>=current_date)) then licence_status:='VERIFIED';
    elsif v.licence_status='REJECTED' then licence_status:='REJECTED';
    elsif v.licence_status='MORE_INFORMATION_REQUIRED' then licence_status:='MORE_INFORMATION_REQUIRED';
    else licence_status:='PENDING'; end if;
  else licence_status:='NOT_REQUIRED'; end if;
  if licence_status<>'VERIFIED' and licence_status<>'NOT_REQUIRED' then blocking:=blocking||jsonb_build_array('LICENCE'); end if;

  if dv.id is null then
    vehicle_status:='PENDING'; registration_status:='PENDING'; ctp_status:='PENDING';
  else
    if dv.status='EXPIRED' or dv.registration_expiry<current_date then vehicle_status:='EXPIRED';
    elsif dv.status='VERIFIED' then vehicle_status:='VERIFIED';
    elsif dv.status='REJECTED' then vehicle_status:='REJECTED';
    else vehicle_status:='PENDING'; end if;

    if dv.registration_status='CURRENT' and dv.registration_expiry is not null and dv.registration_expiry>=current_date
       and v.registration_status='VERIFIED'
       and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='REGISTRATION' and d.status='VERIFIED')
    then registration_status:='VERIFIED';
    elsif dv.registration_status='EXPIRED' or dv.registration_expiry<current_date then registration_status:='EXPIRED';
    elsif v.registration_status='REJECTED' or dv.registration_status='REJECTED' then registration_status:='REJECTED';
    elsif v.registration_status='MORE_INFORMATION_REQUIRED' then registration_status:='MORE_INFORMATION_REQUIRED';
    else registration_status:='PENDING'; end if;

    if dv.ctp_expiry is not null and dv.ctp_expiry<current_date then ctp_status:='EXPIRED';
    elsif dv.ctp_expiry is not null and dv.registration_status='CURRENT' and v.registration_status='VERIFIED' then ctp_status:='VERIFIED';
    else ctp_status:='PENDING'; end if;
  end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='VEHICLE_OWNERSHIP'),false) then
    if exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_OWNERSHIP','VEHICLE_AUTHORIZATION') and d.status='VERIFIED') then
      vehicle_status:=case when vehicle_status='EXPIRED' then vehicle_status else 'VERIFIED' end;
    else
      blocking:=blocking||jsonb_build_array('VEHICLE_OWNERSHIP');
    end if;
  end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='VEHICLE_PHOTOS'),false) then
    if not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type in ('VEHICLE_FRONT','VEHICLE_REAR','VEHICLE_SIDE') and d.status='VERIFIED') then
      blocking:=blocking||jsonb_build_array('VEHICLE_PHOTOS');
    end if;
  end if;

  if registration_status<>'VERIFIED' then blocking:=blocking||jsonb_build_array('REGISTRATION'); end if;
  if ctp_status<>'VERIFIED' then blocking:=blocking||jsonb_build_array('CTP'); end if;

  if coalesce((select required from public.driver_compliance_requirements where jurisdiction_code=jurisdiction and requirement_code='ADDITIONAL_INSURANCE'),false) then
    if v.insurance_expiry is not null and v.insurance_expiry<current_date then insurance_status:='EXPIRED';
    elsif v.insurance_status='VERIFIED' and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='INSURANCE' and d.status='VERIFIED' and coalesce(d.expires_at,v.insurance_expiry)>=current_date) then insurance_status:='VERIFIED';
    elsif v.insurance_status='REJECTED' then insurance_status:='REJECTED';
    elsif v.insurance_status='MORE_INFORMATION_REQUIRED' then insurance_status:='MORE_INFORMATION_REQUIRED';
    else insurance_status:='PENDING'; end if;
    if insurance_status<>'VERIFIED' then blocking:=blocking||jsonb_build_array('ADDITIONAL_INSURANCE'); end if;
  end if;

  if exists(select 1 from public.driver_documents d where d.application_id=a.id and d.status='MORE_INFORMATION_REQUIRED') then
    blocking:=blocking||jsonb_build_array('DOCUMENT_MORE_INFORMATION_REQUIRED');
  end if;

  if exists(select 1 from public.driver_declaration_templates t where t.required=true and t.active=true
            and not exists(select 1 from public.driver_declarations d where d.application_id=a.id and d.declaration_key=t.declaration_key and d.declaration_version=t.version))
  then blocking:=blocking||jsonb_build_array('DECLARATIONS'); end if;

  foreach days in array array[30,14,7] loop
    if v.licence_expiry is not null and v.licence_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','LICENCE','days',days,'expires_at',v.licence_expiry));
    end if;
    if dv.registration_expiry is not null and dv.registration_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','REGISTRATION','days',days,'expires_at',dv.registration_expiry)); end if;
    if dv.ctp_expiry is not null and dv.ctp_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','CTP','days',days,'expires_at',dv.ctp_expiry)); end if;
    if v.insurance_expiry is not null and v.insurance_expiry-current_date=days then expires_soon:=expires_soon||jsonb_build_array(jsonb_build_object('credential','INSURANCE','days',days,'expires_at',v.insurance_expiry)); end if;
  end loop;

  if exists(select 1 from public.driver_documents d where d.application_id=a.id and d.expires_at is not null and d.expires_at<current_date and d.status='VERIFIED') then
    blocking:=blocking||jsonb_build_array('EXPIRED_DOCUMENT');
  end if;

  overall_status:=case
    when a.status='SUSPENDED' then 'SUSPENDED'
    when a.status='REJECTED' then 'REJECTED'
    when a.status='EXPIRED' or blocking ? 'EXPIRED_DOCUMENT' or identity_status='EXPIRED' or licence_status='EXPIRED' or registration_status='EXPIRED' or ctp_status='EXPIRED' or insurance_status='EXPIRED' then 'EXPIRED'
    when a.status='MORE_INFORMATION_REQUIRED' or blocking ? 'DOCUMENT_MORE_INFORMATION_REQUIRED' then 'MORE_INFORMATION_REQUIRED'
    when a.status='DRAFT' then 'DRAFT'
    when a.status='SUBMITTED' then 'SUBMITTED'
    when a.status='UNDER_REVIEW' then 'UNDER_REVIEW'
    when a.status='APPROVED' and jsonb_array_length(blocking)=0 then 'APPROVED'
    else 'UNDER_REVIEW'
  end;

  return jsonb_build_object(
    'jurisdiction',jurisdiction,
    'identity',jsonb_build_object('status',identity_status,'reason',case when identity_status='VERIFIED' then null else 'Manual verification required' end,'source',source_identity),
    'licence',jsonb_build_object('status',licence_status,'reason',case when licence_status='VERIFIED' then null else 'Manual verification required' end,'source',source_licence),
    'vehicle',jsonb_build_object('status',vehicle_status,'reason',case when vehicle_status='VERIFIED' then null else 'Manual verification required' end,'source',source_vehicle),
    'registration',jsonb_build_object('status',registration_status,'reason',case when registration_status='VERIFIED' then null else 'Manual verification required' end,'source',source_registration),
    'ctp',jsonb_build_object('status',ctp_status,'reason',case when ctp_status='VERIFIED' then null else 'Manual verification required' end,'source',source_ctp),
    'insurance',jsonb_build_object('status',insurance_status,'reason',case when insurance_status='VERIFIED' then null else 'Manual verification required' end,'source',source_insurance),
    'overall',jsonb_build_object('status',overall_status,'blockingItems',blocking,'expiresSoon',expires_soon)
  );
end;
$function$

