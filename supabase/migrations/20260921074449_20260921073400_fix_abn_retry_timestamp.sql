-- Hotfix for the already-applied automated verification function: every automated status transition
-- must pass the same trusted server-only trigger context.
create or replace function public.finish_automated_abn_verification(
  p_verification_id uuid,
  p_attempt_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_submitted_by uuid;
  v_status text;
  v_decision text;
  v_reason text;
  v_abn text;
  v_entity_name text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role','') <> 'service_role' then
    raise sqlstate 'PT403' using message = 'SERVER_ONLY';
  end if;

  select business_id, submitted_by, abn
    into v_business_id, v_submitted_by, v_abn
  from public.business_verifications
  where id = p_verification_id
  for update;

  if v_business_id is null then
    raise sqlstate 'PT404' using message = 'VERIFICATION_NOT_FOUND';
  end if;

  v_status := coalesce(p_result->>'status','RETRY');
  v_decision := coalesce(p_result->>'decision','RETRY');
  v_reason := nullif(p_result->>'reason','');
  v_entity_name := nullif(p_result->>'entityName','');

  perform pg_catalog.set_config(
    'everest.automated_business_verification',
    'business:' || v_business_id::text,
    true
  );

  if v_decision = 'AUTO_VERIFIED' then
    update public.business_verifications
    set
      status = 'VERIFIED',
      automated_decision = 'AUTO_VERIFIED',
      automated_rejection_reason = null,
      automated_checked_at = now(),
      retry_after = null,
      provider_status = nullif(p_result->>'abnStatus',''),
      provider_entity_name = v_entity_name,
      provider_entity_type = nullif(p_result->>'entityType',''),
      provider_gst_from = case
        when p_result->>'gstRegisteredFrom' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then (p_result->>'gstRegisteredFrom')::date
        else null
      end,
      provider_retrieved_at = now(),
      provider_register_updated_at = case
        when p_result->>'registerUpdatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then (p_result->>'registerUpdatedAt')::date
        else null
      end,
      provider_match = true,
      provider_message = v_reason,
      provider_business_names = coalesce(p_result->'businessNames','[]'::jsonb),
      provider_state = nullif(p_result->>'state',''),
      provider_postcode = nullif(p_result->>'postcode',''),
      provider_abn_current = coalesce((p_result->>'abnCurrent')::boolean, true)
    where id = p_verification_id;

    update public.businesses
    set
      abn = v_abn,
      verification_status = 'VERIFIED',
      updated_at = now()
    where id = v_business_id;

    update public.profiles
    set role = 'BUSINESS', updated_at = now()
    where id in (
      select user_id
      from public.business_members
      where business_id = v_business_id
    )
      and role = 'CUSTOMER';

    update public.abn_verification_attempts
    set outcome = 'AUTO_VERIFIED'
    where id = p_attempt_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(
      null,
      'ABN_VERIFICATION_LOOKUP_SUCCESS',
      'business_verification',
      p_verification_id,
      jsonb_build_object(
        'business_id', v_business_id,
        'abn_status', p_result->>'abnStatus',
        'name_match', true
      )
    ),(
      null,
      'ABN_VERIFICATION_AUTO_APPROVED',
      'business_verification',
      p_verification_id,
      jsonb_build_object(
        'business_id', v_business_id,
        'reason', v_reason
      )
    );

    return jsonb_build_object(
      'status', 'VERIFIED',
      'decision', 'AUTO_VERIFIED',
      'entityName', v_entity_name
    );
  elsif v_decision = 'AUTO_REJECTED' then
    update public.business_verifications
    set
      status = 'REJECTED',
      automated_decision = 'AUTO_REJECTED',
      automated_rejection_reason = v_reason,
      automated_checked_at = now(),
      retry_after = null,
      provider_status = nullif(p_result->>'abnStatus',''),
      provider_entity_name = v_entity_name,
      provider_entity_type = nullif(p_result->>'entityType',''),
      provider_gst_from = case
        when p_result->>'gstRegisteredFrom' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then (p_result->>'gstRegisteredFrom')::date
        else null
      end,
      provider_retrieved_at = now(),
      provider_register_updated_at = case
        when p_result->>'registerUpdatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then (p_result->>'registerUpdatedAt')::date
        else null
      end,
      provider_match = false,
      provider_message = v_reason,
      provider_business_names = coalesce(p_result->'businessNames','[]'::jsonb),
      provider_state = nullif(p_result->>'state',''),
      provider_postcode = nullif(p_result->>'postcode',''),
      provider_abn_current = coalesce((p_result->>'abnCurrent')::boolean, false)
    where id = p_verification_id;

    update public.businesses
    set verification_status = 'REJECTED', updated_at = now()
    where id = v_business_id;

    update public.abn_verification_attempts
    set outcome = 'AUTO_REJECTED'
    where id = p_attempt_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(
      null,
      'ABN_VERIFICATION_LOOKUP_SUCCESS',
      'business_verification',
      p_verification_id,
      jsonb_build_object(
        'business_id', v_business_id,
        'abn_status', p_result->>'abnStatus',
        'name_match', false
      )
    ),(
      null,
      'ABN_VERIFICATION_AUTO_REJECTED',
      'business_verification',
      p_verification_id,
      jsonb_build_object(
        'business_id', v_business_id,
        'reason', v_reason
      )
    );

    return jsonb_build_object(
      'status', 'REJECTED',
      'decision', 'AUTO_REJECTED',
      'reason', v_reason,
      'entityName', v_entity_name
    );
  else
    update public.business_verifications
    set
      status = 'PENDING',
      automated_decision = 'RETRY',
      automated_rejection_reason = v_reason,
      automated_checked_at = now(),
      retry_after = now() + interval '60 seconds',
      provider_status = nullif(p_result->>'abnStatus',''),
      provider_entity_name = v_entity_name,
      provider_entity_type = nullif(p_result->>'entityType',''),
      provider_retrieved_at = null,
      provider_message = v_reason,
      provider_business_names = coalesce(p_result->'businessNames','[]'::jsonb),
      provider_state = nullif(p_result->>'state',''),
      provider_postcode = nullif(p_result->>'postcode',''),
      provider_abn_current = null
    where id = p_verification_id;

    update public.abn_verification_attempts
    set outcome = 'RETRY'
    where id = p_attempt_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(
      null,
      'ABN_VERIFICATION_RETRY',
      'business_verification',
      p_verification_id,
      jsonb_build_object(
        'business_id', v_business_id,
        'reason', v_reason
      )
    );

    return jsonb_build_object(
      'status', 'PENDING',
      'decision', 'RETRY',
      'retryAfter', now() + interval '60 seconds'
    );
  end if;
end;
$$;


revoke all on function public.finish_automated_abn_verification(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.finish_automated_abn_verification(uuid,uuid,jsonb) to service_role;
