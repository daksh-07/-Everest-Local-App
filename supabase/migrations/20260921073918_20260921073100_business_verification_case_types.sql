alter table public.business_verification_reviews
  add column if not exists case_type text not null default 'MANUAL_REVIEW';

alter table public.business_verification_reviews
  drop constraint if exists business_verification_reviews_case_type_check;

alter table public.business_verification_reviews
  add constraint business_verification_reviews_case_type_check
  check (case_type in ('MANUAL_REVIEW','HELP','FEEDBACK'));

drop function if exists public.request_business_verification_review(uuid,text);

create or replace function public.request_business_verification_review(
  p_verification_id uuid,
  p_explanation text,
  p_case_type text default 'MANUAL_REVIEW'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
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

  if p_case_type not in ('MANUAL_REVIEW','HELP','FEEDBACK') then
    raise sqlstate 'PT422' using message = 'INVALID_CASE_TYPE';
  end if;

  select business_id, abn, automated_decision, automated_rejection_reason, status
    into v_business_id, v_abn, v_decision, v_reason, v_status
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

  if v_status <> 'REJECTED' or v_decision not in ('AUTO_REJECTED','MANUAL_REVIEW_REQUESTED') then
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
    user_explanation,
    case_type
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
    trim(p_explanation),
    p_case_type
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
    jsonb_build_object(
      'business_id', v_business_id,
      'review_id', review_id,
      'case_type', p_case_type
    )
  );

  return review_id;
exception
  when unique_violation then
    raise sqlstate 'PT409' using message = 'MANUAL_REVIEW_ALREADY_PENDING';
end;
$$;

grant execute on function public.request_business_verification_review(uuid,text,text) to authenticated;
