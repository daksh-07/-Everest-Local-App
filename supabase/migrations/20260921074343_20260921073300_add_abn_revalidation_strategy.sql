create or replace function public.begin_automated_abn_verification(
  p_business_id uuid,
  p_submitted_by uuid,
  p_abn text,
  p_revalidate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_abn text;
  verification_id uuid;
  attempt_id uuid;
  current_decision text;
  current_retry_after timestamptz;
  current_retry_count integer;
  recent_user_attempts integer;
  recent_business_attempts integer;
  current_verification_status text;
  last_verified_at timestamptz;
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role','') <> 'service_role' then
    raise sqlstate 'PT403' using message = 'SERVER_ONLY';
  end if;

  if p_submitted_by is null then
    raise sqlstate 'PT401' using message = 'AUTH_REQUIRED';
  end if;

  normalized_abn := regexp_replace(coalesce(p_abn,''), '[[:space:]-]', '', 'g');

  if not public.is_valid_abn(normalized_abn) then
    raise sqlstate 'PT422' using message = 'INVALID_ABN';
  end if;

  select verification_status
    into current_verification_status
  from public.businesses
  where id = p_business_id
    and exists (
      select 1
      from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = p_submitted_by
    )
  for update;

  if not found then
    raise sqlstate 'PT403' using message = 'NOT_AUTHORIZED';
  end if;

  if current_verification_status = 'VERIFIED' and not p_revalidate then
    raise sqlstate 'PT409' using message = 'VERIFICATION_ALREADY_COMPLETED';
  end if;

  if current_verification_status = 'VERIFIED' and p_revalidate then
    select max(provider_retrieved_at)
      into last_verified_at
    from public.business_verifications
    where business_id = p_business_id
      and status = 'VERIFIED'
      and automated_decision in ('AUTO_VERIFIED','MANUAL_APPROVED');

    if last_verified_at is not null and last_verified_at > now() - interval '30 days' then
      raise sqlstate 'PT409' using message = 'REVALIDATION_NOT_DUE';
    end if;
  end if;

  select count(*)::integer
    into recent_user_attempts
  from public.abn_verification_attempts
  where user_id = p_submitted_by
    and created_at >= now() - interval '15 minutes';

  select count(*)::integer
    into recent_business_attempts
  from public.abn_verification_attempts
  where business_id = p_business_id
    and created_at >= now() - interval '15 minutes';

  if recent_user_attempts >= 5 or recent_business_attempts >= 5 then
    raise sqlstate 'PT429' using message = 'RATE_LIMITED';
  end if;

  select id, automated_decision, retry_after, retry_count
    into verification_id, current_decision, current_retry_after, current_retry_count
  from public.business_verifications
  where business_id = p_business_id
    and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  if verification_id is not null then
    if current_decision <> 'RETRY' or current_retry_after is null or current_retry_after > now() then
      raise sqlstate 'PT409' using message = 'VERIFICATION_PENDING';
    end if;

    update public.business_verifications
    set
      submitted_by = p_submitted_by,
      abn = normalized_abn,
      automated_decision = 'LOOKUP_IN_PROGRESS',
      automated_rejection_reason = null,
      automated_checked_at = null,
      retry_count = current_retry_count + 1,
      retry_after = null,
      provider_retrieved_at = null,
      provider_match = null,
      provider_message = null
    where id = verification_id;
  else
    insert into public.business_verifications(
      business_id,
      submitted_by,
      status,
      abn,
      documents,
      automated_decision,
      retry_count
    )
    values(
      p_business_id,
      p_submitted_by,
      'PENDING',
      normalized_abn,
      '[]'::jsonb,
      'LOOKUP_IN_PROGRESS',
      0
    )
    returning id into verification_id;
  end if;

  perform pg_catalog.set_config(
    'everest.automated_business_verification',
    'business:' || p_business_id::text,
    true
  );

  if current_verification_status <> 'VERIFIED' then
    update public.businesses
    set
      abn = normalized_abn,
      verification_status = 'PENDING',
      updated_at = now()
    where id = p_business_id;
  else
    update public.businesses
    set
      abn = normalized_abn,
      updated_at = now()
    where id = p_business_id;
  end if;

  insert into public.abn_verification_attempts(
    business_id,
    verification_id,
    user_id
  )
  values(
    p_business_id,
    verification_id,
    p_submitted_by
  )
  returning id into attempt_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(
    p_submitted_by,
    'ABN_VERIFICATION_SUBMITTED',
    'business_verification',
    verification_id,
    jsonb_build_object(
      'business_id', p_business_id,
      'automated', true,
      'revalidation', p_revalidate
    )
  );

  return jsonb_build_object(
    'verification_id', verification_id,
    'attempt_id', attempt_id,
    'retry_count', coalesce(current_retry_count, 0),
    'revalidation', p_revalidate
  );
end;
$$;

revoke all on function public.begin_automated_abn_verification(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.begin_automated_abn_verification(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.begin_automated_abn_verification(uuid,uuid,text,boolean) to service_role;
