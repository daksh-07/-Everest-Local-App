-- Daily maintenance uses the jurisdiction configuration rather than the legacy
-- global driver_verification_requirements row.

create or replace function public.driver_verification_maintenance()
returns integer
language plpgsql security definer set search_path=public
as $$
declare
  a public.driver_applications; v public.driver_verifications; dv public.driver_vehicles;
  req record; d record; days integer; changed integer:=0; expired_reason text;
begin
  for a in select * from public.driver_applications where status='APPROVED' loop
    select * into v from public.driver_verifications where application_id=a.id;
    select * into dv from public.driver_vehicles where application_id=a.id;
    expired_reason:=null;

    for req in
      select requirement_code from public.driver_compliance_requirements
      where jurisdiction_code=a.compliance_jurisdiction and active=true and required=true
    loop
      if req.requirement_code='LICENCE' and v.licence_expiry is not null and v.licence_expiry<current_date then
        expired_reason:='Driver licence has expired.';
      elsif req.requirement_code='REGISTRATION' and dv.registration_expiry is not null and dv.registration_expiry<current_date then
        expired_reason:='Vehicle registration has expired.';
      elsif req.requirement_code='CTP' and dv.ctp_expiry is not null and dv.ctp_expiry<current_date then
        expired_reason:='Vehicle CTP information has expired.';
      elsif req.requirement_code='ADDITIONAL_INSURANCE' and v.insurance_expiry is not null and v.insurance_expiry<current_date then
        expired_reason:='Required additional insurance has expired.';
      elsif req.requirement_code not in ('LICENCE','REGISTRATION','CTP','ADDITIONAL_INSURANCE') and exists(
        select 1 from public.driver_documents d
        where d.application_id=a.id and d.status='VERIFIED' and d.expires_at is not null and d.expires_at<current_date
      ) then
        expired_reason:='A required driver document has expired.';
      end if;
      if expired_reason is not null then exit; end if;
    end loop;

    if expired_reason is not null then
      update public.driver_applications
        set status='EXPIRED',status_reason=expired_reason,updated_at=now()
        where id=a.id and status='APPROVED';
      if found then
        update public.driver_verifications set
          licence_status=case when v.licence_expiry is not null and v.licence_expiry<current_date then 'EXPIRED' else licence_status end,
          insurance_status=case when v.insurance_expiry is not null and v.insurance_expiry<current_date then 'EXPIRED' else insurance_status end,
          updated_at=now()
        where application_id=a.id;
        update public.driver_vehicles set
          registration_status=case when dv.registration_expiry is not null and dv.registration_expiry<current_date then 'EXPIRED' else registration_status end,
          status=case when dv.registration_expiry is not null and dv.registration_expiry<current_date then 'EXPIRED' else status end,
          updated_at=now()
        where id=dv.id;
        update public.driver_compliance_checks set
          status=case when expires_at is not null and expires_at<current_date then 'EXPIRED' else status end,
          updated_at=now()
        where application_id=a.id;
        insert into public.driver_status_history(application_id,action,previous_status,new_status,reason,metadata)
        values(a.id,'CREDENTIAL_EXPIRED','APPROVED','EXPIRED',expired_reason,jsonb_build_object('source','daily_maintenance'));
        insert into public.notifications(user_id,kind,title,body,data)
        values(a.user_id,'DRIVER_CREDENTIAL_EXPIRED','Driver access restricted',expired_reason,jsonb_build_object('application_id',a.id));
        changed:=changed+1;
      end if;
      continue;
    end if;

    if v.licence_expiry is not null then
      days:=v.licence_expiry-current_date;
      if days in (30,14,7) and not exists(
        select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_LICENCE_EXPIRY'
          and n.data->>'expiry_date'=v.licence_expiry::text and n.data->>'days'=days::text
      ) then
        insert into public.notifications(user_id,kind,title,body,data)
        values(a.user_id,'DRIVER_LICENCE_EXPIRY','Driver licence expires soon','Your driver licence expires in '||days||' days.',
          jsonb_build_object('application_id',a.id,'credential','LICENCE','expiry_date',v.licence_expiry,'days',days));
      end if;
    end if;

    if dv.registration_expiry is not null then
      days:=dv.registration_expiry-current_date;
      if days in (30,14,7) and not exists(
        select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_REGISTRATION_EXPIRY'
          and n.data->>'expiry_date'=dv.registration_expiry::text and n.data->>'days'=days::text
      ) then
        insert into public.notifications(user_id,kind,title,body,data)
        values(a.user_id,'DRIVER_REGISTRATION_EXPIRY','Vehicle registration expires soon','Your vehicle registration expires in '||days||' days.',
          jsonb_build_object('application_id',a.id,'credential','REGISTRATION','expiry_date',dv.registration_expiry,'days',days));
      end if;
    end if;

    if dv.ctp_expiry is not null then
      days:=dv.ctp_expiry-current_date;
      if days in (30,14,7) and not exists(
        select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_CTP_EXPIRY'
          and n.data->>'expiry_date'=dv.ctp_expiry::text and n.data->>'days'=days::text
      ) then
        insert into public.notifications(user_id,kind,title,body,data)
        values(a.user_id,'DRIVER_CTP_EXPIRY','CTP expires soon','Your recorded CTP coverage expires in '||days||' days.',
          jsonb_build_object('application_id',a.id,'credential','CTP','expiry_date',dv.ctp_expiry,'days',days));
      end if;
    end if;

    if v.insurance_expiry is not null then
      days:=v.insurance_expiry-current_date;
      if days in (30,14,7) and not exists(
        select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_INSURANCE_EXPIRY'
          and n.data->>'expiry_date'=v.insurance_expiry::text and n.data->>'days'=days::text
      ) then
        insert into public.notifications(user_id,kind,title,body,data)
        values(a.user_id,'DRIVER_INSURANCE_EXPIRY','Insurance expires soon','Your recorded additional insurance expires in '||days||' days.',
          jsonb_build_object('application_id',a.id,'credential','INSURANCE','expiry_date',v.insurance_expiry,'days',days));
      end if;
    end if;

    for d in select document_type,expires_at from public.driver_documents
      where application_id=a.id and status='VERIFIED' and expires_at is not null
    loop
      days:=d.expires_at-current_date;
      if days in (30,14,7) and not exists(
        select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_DOCUMENT_EXPIRY'
          and n.data->>'document_type'=d.document_type and n.data->>'expiry_date'=d.expires_at::text and n.data->>'days'=days::text
      ) then
        insert into public.notifications(user_id,kind,title,body,data)
        values(a.user_id,'DRIVER_DOCUMENT_EXPIRY','Driver document expires soon',
          d.document_type||' expires in '||days||' days.',
          jsonb_build_object('application_id',a.id,'credential','DOCUMENT','document_type',d.document_type,'expiry_date',d.expires_at,'days',days));
      end if;
    end loop;
  end loop;
  return changed;
end;
$$;
revoke execute on function public.driver_verification_maintenance() from public,anon,authenticated;
