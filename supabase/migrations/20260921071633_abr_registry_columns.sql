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
