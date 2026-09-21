alter table public.business_verifications
  add column if not exists abr_check_status text not null default 'NOT_CHECKED',
  add column if not exists abr_checked_at timestamptz,
  add column if not exists abr_abn_status text,
  add column if not exists abr_abn_status_effective_from date,
  add column if not exists abr_entity_name text,
  add column if not exists abr_entity_type text,
  add column if not exists abr_entity_type_code text,
  add column if not exists abr_gst_registered boolean,
  add column if not exists abr_gst_registered_from date,
  add column if not exists abr_state text,
  add column if not exists abr_postcode text,
  add column if not exists abr_business_names jsonb not null default '[]'::jsonb,
  add column if not exists abr_match boolean,
  add column if not exists abr_message text;

alter table public.business_verifications
  drop constraint if exists business_verifications_abr_check_status_check;

alter table public.business_verifications
  add constraint business_verifications_abr_check_status_check
  check (abr_check_status in ('NOT_CHECKED','MATCHED','MISMATCH','INACTIVE','NOT_FOUND','ERROR'));

create index if not exists business_verifications_abr_check_status_idx
  on public.business_verifications(abr_check_status);

drop policy if exists business_verifications_admin_select on public.business_verifications;

create policy business_verifications_admin_select
  on public.business_verifications
  for select
  to authenticated
  using ((select public.is_admin()));

create or replace function public.record_business_abr_check(
  p_business_id uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required';
  end if;

  select id
  into latest_id
  from public.business_verifications
  where business_id = p_business_id
  order by created_at desc
  limit 1;

  if latest_id is null then
    raise exception 'No business verification submission exists';
  end if;

  update public.business_verifications
  set
    abr_check_status = coalesce(nullif(p_result->>'status',''),'ERROR'),
    abr_checked_at = now(),
    abr_abn_status = nullif(p_result->>'abnStatus',''),
    abr_abn_status_effective_from = case
      when p_result->>'abnStatusEffectiveFrom' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then (p_result->>'abnStatusEffectiveFrom')::date
      else null
    end,
    abr_entity_name = nullif(p_result->>'entityName',''),
    abr_entity_type = nullif(p_result->>'entityType',''),
    abr_entity_type_code = nullif(p_result->>'entityTypeCode',''),
    abr_gst_registered = case
      when p_result ? 'gstRegistered' then (p_result->>'gstRegistered')::boolean
      else null
    end,
    abr_gst_registered_from = case
      when p_result->>'gstRegisteredFrom' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then (p_result->>'gstRegisteredFrom')::date
      else null
    end,
    abr_state = nullif(p_result->>'state',''),
    abr_postcode = nullif(p_result->>'postcode',''),
    abr_business_names = coalesce(p_result->'businessNames','[]'::jsonb),
    abr_match = case
      when p_result ? 'nameMatch' then (p_result->>'nameMatch')::boolean
      else null
    end,
    abr_message = nullif(p_result->>'message','')
  where id = latest_id;

  insert into public.admin_actions(
    admin_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'business_abr_check',
    'business',
    p_business_id,
    jsonb_build_object(
      'status', p_result->>'status',
      'name_match', p_result->>'nameMatch',
      'abn_status', p_result->>'abnStatus'
    )
  );

  return true;
end;
$$;

grant execute on function public.record_business_abr_check(uuid,jsonb) to authenticated;
