create extension if not exists pg_cron;

create or replace function public.driver_verification_maintenance()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare a public.driver_applications; v public.driver_verifications; dv public.driver_vehicles; req public.driver_verification_requirements; changed integer:=0; days integer; kind text; expiry_date date; expiry_label text;
begin
  select * into req from public.driver_verification_requirements where id=true;
  for a in select * from public.driver_applications where status='APPROVED' loop
    select * into v from public.driver_verifications where application_id=a.id;
    select * into dv from public.driver_vehicles where application_id=a.id;
    if v.application_id is null then continue; end if;

    if v.licence_expiry is not null and v.licence_expiry<current_date then
      update public.driver_verifications set licence_status='EXPIRED',updated_at=now() where application_id=a.id;
      update public.driver_applications set status='EXPIRED',status_reason='Driver licence has expired.',updated_at=now() where id=a.id;
      insert into public.driver_status_history(application_id,action,previous_status,new_status,reason) values(a.id,'CREDENTIAL_EXPIRED','APPROVED','EXPIRED','Driver licence has expired.');
      insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_CREDENTIAL_EXPIRED','Driver access restricted','Your driver licence has expired. Update it and request review before accepting delivery work.',jsonb_build_object('application_id',a.id,'credential','LICENCE','expiry_date',v.licence_expiry));
      changed:=changed+1; continue;
    end if;

    if dv.registration_expiry is not null and dv.registration_expiry<current_date then
      update public.driver_verifications set registration_status='EXPIRED',updated_at=now() where application_id=a.id;
      update public.driver_vehicles set registration_status='EXPIRED',status='EXPIRED',updated_at=now() where id=dv.id;
      update public.driver_applications set status='EXPIRED',status_reason='Vehicle registration has expired.',updated_at=now() where id=a.id;
      insert into public.driver_status_history(application_id,action,previous_status,new_status,reason) values(a.id,'CREDENTIAL_EXPIRED','APPROVED','EXPIRED','Vehicle registration has expired.');
      insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_CREDENTIAL_EXPIRED','Driver access restricted','Your vehicle registration has expired. Update it and request review before accepting delivery work.',jsonb_build_object('application_id',a.id,'credential','REGISTRATION','expiry_date',dv.registration_expiry));
      changed:=changed+1; continue;
    end if;

    if dv.ctp_expiry is not null and dv.ctp_expiry<current_date then
      update public.driver_applications set status='EXPIRED',status_reason='Vehicle CTP information has expired.',updated_at=now() where id=a.id;
      update public.driver_vehicles set ctp_expiry=dv.ctp_expiry,updated_at=now() where id=dv.id;
      insert into public.driver_status_history(application_id,action,previous_status,new_status,reason) values(a.id,'CREDENTIAL_EXPIRED','APPROVED','EXPIRED','Vehicle CTP information has expired.');
      insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_CTP_EXPIRED','Driver access restricted','Your vehicle CTP information has expired. Update the vehicle verification before accepting delivery work.',jsonb_build_object('application_id',a.id,'credential','CTP','expiry_date',dv.ctp_expiry));
      changed:=changed+1; continue;
    end if;

    if req.require_additional_insurance and v.insurance_expiry is not null and v.insurance_expiry<current_date then
      update public.driver_verifications set insurance_status='EXPIRED',updated_at=now() where application_id=a.id;
      update public.driver_applications set status='EXPIRED',status_reason='Required additional insurance has expired.',updated_at=now() where id=a.id;
      insert into public.driver_status_history(application_id,action,previous_status,new_status,reason) values(a.id,'CREDENTIAL_EXPIRED','APPROVED','EXPIRED','Required additional insurance has expired.');
      insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_CREDENTIAL_EXPIRED','Driver access restricted','Required additional insurance has expired. Update it and request review before accepting delivery work.',jsonb_build_object('application_id',a.id,'credential','INSURANCE','expiry_date',v.insurance_expiry));
      changed:=changed+1; continue;
    end if;

    if v.licence_expiry is not null then
      days:=v.licence_expiry-current_date;
      if days in (30,14,7) and not exists(select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_LICENCE_EXPIRY' and n.data->>'expiry_date'=v.licence_expiry::text and n.data->>'days'=days::text) then
        insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_LICENCE_EXPIRY','Driver licence expires soon','Your driver licence expires in '||days||' days.',jsonb_build_object('application_id',a.id,'credential','LICENCE','expiry_date',v.licence_expiry,'days',days));
      end if;
    end if;

    if dv.registration_expiry is not null then
      days:=dv.registration_expiry-current_date;
      if days in (30,14,7) and not exists(select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_REGISTRATION_EXPIRY' and n.data->>'expiry_date'=dv.registration_expiry::text and n.data->>'days'=days::text) then
        insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_REGISTRATION_EXPIRY','Vehicle registration expires soon','Your vehicle registration expires in '||days||' days.',jsonb_build_object('application_id',a.id,'credential','REGISTRATION','expiry_date',dv.registration_expiry,'days',days));
      end if;
    end if;

    if req.require_additional_insurance and v.insurance_expiry is not null then
      days:=v.insurance_expiry-current_date;
      if days in (30,14,7) and not exists(select 1 from public.notifications n where n.user_id=a.user_id and n.kind='DRIVER_INSURANCE_EXPIRY' and n.data->>'expiry_date'=v.insurance_expiry::text and n.data->>'days'=days::text) then
        insert into public.notifications(user_id,kind,title,body,data) values(a.user_id,'DRIVER_INSURANCE_EXPIRY','Insurance expires soon','Your required insurance expires in '||days||' days.',jsonb_build_object('application_id',a.id,'credential','INSURANCE','expiry_date',v.insurance_expiry,'days',days));
      end if;
    end if;
  end loop;
  return changed;
end;
$$;
revoke execute on function public.driver_verification_maintenance() from public,anon,authenticated;
select cron.schedule('driver-verification-maintenance','0 0 * * *','select public.driver_verification_maintenance();');