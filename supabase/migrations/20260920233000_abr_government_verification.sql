-- Government-backed ABN verification foundation and admin RPC access.
-- ABR Lookup confirms public business-registration data; Everest admin remains the final
-- authorization boundary for VERIFIED marketplace status.

alter table public.business_verifications
  add column if not exists verification_provider text,
  add column if not exists provider_reference text,
  add column if not exists provider_status text,
  add column if not exists provider_entity_name text,
  add column if not exists provider_entity_type text,
  add column if not exists provider_gst_from date,
  add column if not exists provider_retrieved_at timestamptz,
  add column if not exists provider_register_updated_at date,
  add column if not exists provider_match boolean,
  add column if not exists provider_message text;

create or replace function public.submit_business_verification_from_abr(
  p_business_id uuid,
  p_submitted_by uuid,
  p_abn text,
  p_provider text,
  p_provider_reference text,
  p_provider_status text,
  p_provider_entity_name text,
  p_provider_entity_type text,
  p_provider_gst_from date default null,
  p_provider_retrieved_at timestamptz default now(),
  p_provider_register_updated_at date default null,
  p_provider_match boolean default false,
  p_provider_message text default null
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
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role','') <> 'service_role' then
    raise sqlstate 'PT403' using message = 'SERVER_ONLY';
  end if;

  if p_submitted_by is null then
    raise sqlstate 'PT401' using message = 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = p_submitted_by
  ) then
    raise sqlstate 'PT403' using message = 'NOT_AUTHORIZED';
  end if;

  normalized_abn := regexp_replace(coalesce(p_abn,''), '[[:space:]-]', '', 'g');

  if not public.is_valid_abn(normalized_abn) then
    raise sqlstate 'PT422' using message = 'INVALID_ABN';
  end if;

  if p_provider <> 'ABR_ABN_LOOKUP' then
    raise sqlstate 'PT422' using message = 'UNSUPPORTED_PROVIDER';
  end if;

  if coalesce(p_provider_status,'') <> 'Active' then
    raise sqlstate 'PT422' using message = 'ABN_NOT_ACTIVE';
  end if;

  if p_provider_match is not true then
    raise sqlstate 'PT422' using message = 'BUSINESS_NAME_MISMATCH';
  end if;

  if exists (
    select 1
    from public.business_verifications
    where business_id = p_business_id
      and status = 'PENDING'
  ) then
    raise sqlstate 'PT409' using message = 'VERIFICATION_PENDING';
  end if;

  if exists (
    select 1
    from public.businesses
    where id = p_business_id
      and verification_status = 'VERIFIED'
  ) then
    raise sqlstate 'PT409' using message = 'VERIFICATION_ALREADY_COMPLETED';
  end if;

  insert into public.business_verifications(
    business_id,
    submitted_by,
    status,
    abn,
    documents,
    verification_provider,
    provider_reference,
    provider_status,
    provider_entity_name,
    provider_entity_type,
    provider_gst_from,
    provider_retrieved_at,
    provider_register_updated_at,
    provider_match,
    provider_message
  )
  values (
    p_business_id,
    p_submitted_by,
    'PENDING',
    normalized_abn,
    '[]'::jsonb,
    p_provider,
    p_provider_reference,
    p_provider_status,
    p_provider_entity_name,
    p_provider_entity_type,
    p_provider_gst_from,
    coalesce(p_provider_retrieved_at, now()),
    p_provider_register_updated_at,
    p_provider_match,
    p_provider_message
  )
  returning id into vid;

  update public.businesses
  set
    abn = normalized_abn,
    verification_status = 'PENDING',
    updated_at = now()
  where id = p_business_id;

  return vid;
exception
  when unique_violation then
    raise sqlstate 'PT409' using message = 'VERIFICATION_PENDING';
end;
$$;

revoke execute on function public.submit_business_verification_from_abr(
  uuid,uuid,text,text,text,text,text,text,date,timestamptz,date,boolean,text
) from public, anon, authenticated;
grant execute on function public.submit_business_verification_from_abr(
  uuid,uuid,text,text,text,text,text,text,date,timestamptz,date,boolean,text
) to service_role;

-- admin_set_verification deliberately remains callable by authenticated users:
-- the function itself enforces public.is_admin(). This allows the real /admin UI
-- to perform server-authorized review actions without exposing them to non-admins.
grant execute on function public.admin_set_verification(uuid, public.verification_status, text)
  to authenticated;
