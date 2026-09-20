create or replace function public.is_valid_abn(p_abn text)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  with normalized as (
    select regexp_replace(p_abn, '[[:space:]-]', '', 'g') as abn
  )
  select case
    when length(abn) <> 11 or abn !~ '^[0-9]{11}$' then false
    else mod(
      (substring(abn,1,1)::integer - 1) * 10 +
      substring(abn,2,1)::integer * 1 +
      substring(abn,3,1)::integer * 3 +
      substring(abn,4,1)::integer * 5 +
      substring(abn,5,1)::integer * 7 +
      substring(abn,6,1)::integer * 9 +
      substring(abn,7,1)::integer * 11 +
      substring(abn,8,1)::integer * 13 +
      substring(abn,9,1)::integer * 15 +
      substring(abn,10,1)::integer * 17 +
      substring(abn,11,1)::integer * 19,
      89
    ) = 0
  end
  from normalized;
$$;

create unique index if not exists business_verifications_one_pending_per_business
  on public.business_verifications(business_id)
  where status = 'PENDING';

create or replace function public.guard_business_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
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
set search_path = public
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

revoke all on function public.is_valid_abn(text) from public, anon, authenticated;
grant execute on function public.is_valid_abn(text) to postgres;

grant execute on function public.submit_business_verification(uuid,text,jsonb) to authenticated;
