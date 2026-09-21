-- Automated ABN verification state, retry controls and exception review workflow.

alter table public.business_verifications
  add column if not exists automated_decision text not null default 'NOT_RUN',
  add column if not exists automated_rejection_reason text,
  add column if not exists automated_checked_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists retry_after timestamptz,
  add column if not exists provider_business_names jsonb not null default '[]'::jsonb,
  add column if not exists provider_state text,
  add column if not exists provider_postcode text,
  add column if not exists provider_abn_current boolean;

alter table public.business_verifications
  drop constraint if exists business_verifications_automated_decision_check;

alter table public.business_verifications
  add constraint business_verifications_automated_decision_check
  check (automated_decision in (
    'NOT_RUN',
    'LOOKUP_IN_PROGRESS',
    'AUTO_VERIFIED',
    'AUTO_REJECTED',
    'RETRY',
    'MANUAL_REVIEW_REQUESTED',
    'MANUAL_APPROVED',
    'MANUAL_REJECTED'
  ));

alter table public.business_verifications
  add constraint business_verifications_retry_count_check
  check (retry_count >= 0 and retry_count <= 20);

create index if not exists business_verifications_automated_decision_idx
  on public.business_verifications(automated_decision, created_at desc);

create index if not exists business_verifications_submitted_by_created_idx
  on public.business_verifications(submitted_by, created_at desc);

create table if not exists public.abn_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  verification_id uuid not null references public.business_verifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  outcome text not null default 'STARTED',
  constraint abn_verification_attempts_outcome_check
    check (outcome in ('STARTED','AUTO_VERIFIED','AUTO_REJECTED','RETRY','MANUAL_REVIEW_REQUESTED','ERROR','RATE_LIMITED'))
);

create index if not exists abn_verification_attempts_user_created_idx
  on public.abn_verification_attempts(user_id, created_at desc);

create index if not exists abn_verification_attempts_business_created_idx
  on public.abn_verification_attempts(business_id, created_at desc);

alter table public.abn_verification_attempts enable row level security;

drop policy if exists abn_verification_attempts_admin_select on public.abn_verification_attempts;
create policy abn_verification_attempts_admin_select
  on public.abn_verification_attempts
  for select
  to authenticated
  using ((select public.is_admin()));

revoke all on table public.abn_verification_attempts from public, anon, authenticated;
grant select on table public.abn_verification_attempts to authenticated;

create table if not exists public.business_verification_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  verification_id uuid not null references public.business_verifications(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  abn text not null,
  automated_decision text not null,
  automated_rejection_reason text,
  authoritative_status text,
  authoritative_entity_name text,
  user_explanation text not null,
  status text not null default 'PENDING',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_verification_reviews_status_check
    check (status in ('PENDING','APPROVED','REJECTED'))
);

create unique index if not exists business_verification_reviews_one_pending
  on public.business_verification_reviews(business_id)
  where status = 'PENDING';

create index if not exists business_verification_reviews_status_created_idx
  on public.business_verification_reviews(status, created_at desc);

alter table public.business_verification_reviews enable row level security;

drop policy if exists business_verification_reviews_participant_select on public.business_verification_reviews;
create policy business_verification_reviews_participant_select
  on public.business_verification_reviews
  for select
  to authenticated
  using (
    requested_by = (select auth.uid())
    or (select public.is_business_member(business_id))
    or (select public.is_admin())
  );

drop policy if exists business_verification_reviews_admin_update on public.business_verification_reviews;
create policy business_verification_reviews_admin_update
  on public.business_verification_reviews
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on table public.business_verification_reviews from public, anon, authenticated;
grant select on table public.business_verification_reviews to authenticated;

create or replace function public.guard_business_security_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  automated_context text;
begin
  automated_context := current_setting('everest.automated_business_verification', true);

  if not public.is_admin() then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Business ownership cannot be changed by a business user';
    end if;

    if new.verification_status is distinct from old.verification_status then
      if not (
        new.verification_status = 'PENDING'
        and old.verification_status in ('UNVERIFIED','REJECTED')
        and current_setting('everest.business_verification_submission', true)
            = 'submit:' || old.id::text || ':' || auth.uid()::text
      )
      and not (
        new.verification_status in ('VERIFIED','REJECTED','PENDING')
        and automated_context = 'business:' || old.id::text
        and current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
      ) then
        raise exception 'Verification status is admin-controlled';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.begin_automated_abn_verification(
  p_business_id uuid,
  p_submitted_by uuid,
  p_abn text
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

  select verification_status
    into current_decision
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

  if current_decision = 'VERIFIED' then
    raise sqlstate 'PT409' using message = 'VERIFICATION_ALREADY_COMPLETED';
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

  update public.businesses
  set
    abn = normalized_abn,
    verification_status = 'PENDING',
    updated_at = now()
  where id = p_business_id;

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
      'automated', true
    )
  );

  return jsonb_build_object(
    'verification_id', verification_id,
    'attempt_id', attempt_id,
    'retry_count', coalesce(current_retry_count, 0)
  );
end;
$$;

revoke all on function public.begin_automated_abn_verification(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.begin_automated_abn_verification(uuid,uuid,text) to service_role;

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

  if v_decision = 'AUTO_VERIFIED' then
    perform pg_catalog.set_config(
      'everest.automated_business_verification',
      'business:' || v_business_id::text,
      true
    );

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
      provider_retrieved_at = now(),
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

create or replace function public.request_business_verification_review(
  p_verification_id uuid,
  p_explanation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_submitted_by uuid;
  v_abn text;
  v_decision text;
  v_reason text;
  v_status text;
  review_id uuid;
begin
  if auth.uid() is null then
    raise sqlstate 'PT401' using message = 'AUTH_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_explanation,'')),'') is null then
    raise sqlstate 'PT422' using message = 'EXPLANATION_REQUIRED';
  end if;

  select business_id, submitted_by, abn, automated_decision, automated_rejection_reason, status
    into v_business_id, v_submitted_by, v_abn, v_decision, v_reason, v_status
  from public.business_verifications
  where id = p_verification_id
  for update;

  if v_business_id is null then
    raise sqlstate 'PT404' using message = 'VERIFICATION_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.business_members
    where business_id = v_business_id
      and user_id = auth.uid()
  ) then
    raise sqlstate 'PT403' using message = 'NOT_AUTHORIZED';
  end if;

  if v_status <> 'REJECTED' or v_decision <> 'AUTO_REJECTED' then
    raise sqlstate 'PT409' using message = 'MANUAL_REVIEW_NOT_AVAILABLE';
  end if;

  insert into public.business_verification_reviews(
    business_id,
    verification_id,
    requested_by,
    abn,
    automated_decision,
    automated_rejection_reason,
    authoritative_status,
    authoritative_entity_name,
    user_explanation
  )
  values(
    v_business_id,
    p_verification_id,
    auth.uid(),
    v_abn,
    v_decision,
    v_reason,
    (select provider_status from public.business_verifications where id = p_verification_id),
    (select provider_entity_name from public.business_verifications where id = p_verification_id),
    trim(p_explanation)
  )
  returning id into review_id;

  update public.business_verifications
  set automated_decision = 'MANUAL_REVIEW_REQUESTED'
  where id = p_verification_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(
    auth.uid(),
    'ABN_VERIFICATION_MANUAL_REVIEW_REQUESTED',
    'business_verification',
    p_verification_id,
    jsonb_build_object('business_id', v_business_id, 'review_id', review_id)
  );

  return review_id;
exception
  when unique_violation then
    raise sqlstate 'PT409' using message = 'MANUAL_REVIEW_ALREADY_PENDING';
end;
$$;

grant execute on function public.request_business_verification_review(uuid,text) to authenticated;

create or replace function public.resolve_business_verification_review(
  p_review_id uuid,
  p_decision text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_verification_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required';
  end if;

  if p_decision not in ('APPROVED','REJECTED') or nullif(trim(coalesce(p_reason,'')),'') is null then
    raise sqlstate 'PT422' using message = 'INVALID_REVIEW_DECISION';
  end if;

  select business_id, verification_id
    into v_business_id, v_verification_id
  from public.business_verification_reviews
  where id = p_review_id
    and status = 'PENDING'
  for update;

  if v_business_id is null then
    raise sqlstate 'PT404' using message = 'MANUAL_REVIEW_NOT_FOUND';
  end if;

  update public.business_verification_reviews
  set
    status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    decision_reason = trim(p_reason),
    updated_at = now()
  where id = p_review_id;

  if p_decision = 'APPROVED' then
    update public.business_verifications
    set
      status = 'VERIFIED',
      automated_decision = 'MANUAL_APPROVED',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = trim(p_reason)
    where id = v_verification_id;

    update public.businesses
    set verification_status = 'VERIFIED', updated_at = now()
    where id = v_business_id;

    update public.profiles
    set role = 'BUSINESS', updated_at = now()
    where id in (select user_id from public.business_members where business_id = v_business_id)
      and role = 'CUSTOMER';

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(auth.uid(),'ABN_VERIFICATION_MANUAL_APPROVED','business_verification',v_verification_id,
      jsonb_build_object('business_id',v_business_id,'review_id',p_review_id));
  else
    update public.business_verifications
    set
      status = 'REJECTED',
      automated_decision = 'MANUAL_REJECTED',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = trim(p_reason)
    where id = v_verification_id;

    update public.businesses
    set verification_status = 'REJECTED', updated_at = now()
    where id = v_business_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(auth.uid(),'ABN_VERIFICATION_MANUAL_REJECTED','business_verification',v_verification_id,
      jsonb_build_object('business_id',v_business_id,'review_id',p_review_id));
  end if;

  return true;
end;
$$;

revoke all on function public.resolve_business_verification_review(uuid,text,text) from public, anon, authenticated;
grant execute on function public.resolve_business_verification_review(uuid,text,text) to authenticated;

-- Server-only automated functions are deliberately not reachable from the mobile Data API.
revoke all on function public.begin_automated_abn_verification(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.finish_automated_abn_verification(uuid,uuid,jsonb) from public, anon, authenticated;
