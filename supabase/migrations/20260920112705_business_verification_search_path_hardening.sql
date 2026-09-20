create or replace function public.guard_business_security_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Business ownership cannot be changed by a business user';
    end if;

    if new.verification_status is distinct from old.verification_status then
      if not (
        new.verification_status = 'PENDING'
        and old.verification_status in ('UNVERIFIED','REJECTED')
        and pg_catalog.current_setting('everest.business_verification_submission', true)
            = 'submit:' || old.id::text || ':' || auth.uid()::text
      ) then
        raise exception 'Verification status is admin-controlled';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.submit_business_verification(
  p_business_id uuid,
  p_abn text,
  p_documents jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  vid uuid;
  normalized_abn text;
begin
  if auth.uid() is null then
    raise sqlstate 'PT401' using message = 'AUTH_REQUIRED';
  end if;

  if not public.is_business_member(p_business_id) and not public.is_admin() then
    raise sqlstate 'PT403' using message = 'NOT_AUTHORIZED';
  end if;

  normalized_abn := regexp_replace(coalesce(p_abn,''), '[[:space:]-]', '', 'g');

  if not public.is_valid_abn(normalized_abn) then
    raise sqlstate 'PT422' using message = 'INVALID_ABN';
  end if;

  if exists(
    select 1
    from public.business_verifications
    where business_id = p_business_id
      and status = 'PENDING'
  ) then
    raise sqlstate 'PT409' using message = 'VERIFICATION_PENDING';
  end if;

  if exists(
    select 1
    from public.businesses
    where id = p_business_id
      and verification_status = 'VERIFIED'
  ) then
    raise sqlstate 'PT409' using message = 'VERIFICATION_ALREADY_COMPLETED';
  end if;

  perform pg_catalog.set_config(
    'everest.business_verification_submission',
    'submit:' || p_business_id::text || ':' || auth.uid()::text,
    true
  );

  begin
    insert into public.business_verifications(
      business_id,
      submitted_by,
      status,
      abn,
      documents
    )
    values(
      p_business_id,
      auth.uid(),
      'PENDING',
      normalized_abn,
      coalesce(p_documents,'[]'::jsonb)
    )
    returning id into vid;

    update public.businesses
    set
      abn = normalized_abn,
      verification_status = 'PENDING',
      updated_at = now()
    where id = p_business_id;
  exception
    when unique_violation then
      raise sqlstate 'PT409' using message = 'VERIFICATION_PENDING';
  end;

  return vid;
end;
$$;

create or replace function public.admin_set_verification(
  p_business_id uuid,
  p_status public.verification_status,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required';
  end if;

  update public.businesses
  set verification_status=p_status,updated_at=now()
  where id=p_business_id;

  update public.business_verifications
  set status=p_status,admin_notes=p_notes,reviewed_by=auth.uid(),reviewed_at=now()
  where id=(
    select id
    from public.business_verifications
    where business_id=p_business_id
    order by created_at desc
    limit 1
  );

  if p_status='VERIFIED' then
    update public.profiles
    set role='BUSINESS',updated_at=now()
    where id in (
      select user_id from public.business_members where business_id=p_business_id
    )
      and role='CUSTOMER';
  end if;

  insert into public.admin_actions(admin_id,action,target_type,target_id,metadata)
  values(auth.uid(),'business_verification','business',p_business_id,jsonb_build_object('status',p_status));

  return true;
end;
$$;

grant execute on function public.submit_business_verification(uuid,text,jsonb) to authenticated;
grant execute on function public.admin_set_verification(uuid,public.verification_status,text) to authenticated;
