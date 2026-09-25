-- CRM integrations and automation foundation.
-- Provider secrets are deliberately not stored in exposed tables. OAuth functions keep
-- refresh/access tokens in their server-side secret store and reference a connection id.

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  connected_by_user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null check (provider in ('GOOGLE_CALENDAR','MICROSOFT_CALENDAR','GMAIL','OPENAI')),
  provider_account_id text,
  account_label text,
  status text not null default 'PENDING' check (status in ('PENDING','CONNECTED','NEEDS_ATTENTION','REVOKED')),
  granted_scopes text[] not null default '{}',
  secret_reference text,
  last_error_code text,
  connected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  unique (business_id,provider,provider_account_id)
);
create index integration_connections_business_idx on public.integration_connections(business_id,provider,status);

-- Ciphertext only. No client role receives table privileges or an RLS policy. The Edge
-- connector encrypts tokens with INTEGRATION_TOKEN_ENCRYPTION_KEY before service-role writes.
create table public.integration_oauth_credentials (
  connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id,business_id),
  foreign key (connection_id,business_id) references public.integration_connections(id,business_id) on delete cascade
);
alter table public.integration_oauth_credentials enable row level security;
revoke all on public.integration_oauth_credentials from public,anon,authenticated;

create table public.calendar_connections (
  id uuid primary key references public.integration_connections(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('GOOGLE_CALENDAR','MICROSOFT_CALENDAR')),
  provider_calendar_id text,
  calendar_label text,
  sync_enabled boolean not null default false,
  import_busy_time boolean not null default true,
  export_marketplace_bookings boolean not null default true,
  export_crm_bookings boolean not null default true,
  export_tasks boolean not null default false,
  sync_direction text not null default 'TWO_WAY' check (sync_direction in ('IMPORT_ONLY','EXPORT_ONLY','TWO_WAY')),
  webhook_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (id,business_id) references public.integration_connections(id,business_id) on delete cascade
);

create table public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  external_event_id text not null,
  external_etag text,
  marketplace_booking_id uuid references public.bookings(id) on delete cascade,
  crm_booking_id uuid references public.crm_bookings(id) on delete cascade,
  crm_task_id uuid references public.crm_tasks(id) on delete cascade,
  sync_direction text not null check (sync_direction in ('IMPORTED','EXPORTED')),
  last_external_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id,connection_id,external_event_id),
  check (num_nonnulls(marketplace_booking_id,crm_booking_id,crm_task_id) <= 1)
);
create index calendar_event_links_native_idx on public.calendar_event_links(business_id,crm_booking_id,marketplace_booking_id,crm_task_id);

create table public.external_calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  external_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'BUSY' check (status in ('BUSY','CANCELLED')),
  privacy text not null default 'OPAQUE' check (privacy in ('OPAQUE','DETAILS_ALLOWED')),
  safe_label text not null default 'Busy',
  provider_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (business_id,connection_id,external_event_id),
  check (ends_at > starts_at),
  check (privacy='DETAILS_ALLOWED' or safe_label='Busy')
);
create index external_calendar_busy_range_idx on public.external_calendar_busy_blocks using gist (business_id, tstzrange(starts_at,ends_at,'[)')) where status='BUSY';

create table public.crm_automations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED')),
  trigger_type text not null check (trigger_type in ('NEW_LEAD','DEAL_CREATED','DEAL_STAGE_CHANGED','QUOTE_CREATED','QUOTE_SENT','QUOTE_VIEWED','QUOTE_ACCEPTED','QUOTE_DECLINED','BOOKING_CREATED','BOOKING_COMPLETED','BOOKING_CANCELLED','TASK_DUE','CUSTOMER_INACTIVE','EMAIL_RECEIVED','CALENDAR_EVENT_CREATED','CUSTOMER_MESSAGE_RECEIVED')),
  trigger_config jsonb not null default '{}',
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id)
);
create index crm_automations_trigger_idx on public.crm_automations(business_id,status,trigger_type);

create table public.crm_automation_conditions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  automation_id uuid not null references public.crm_automations(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  field text not null check (field in ('source','deal_stage','service','tag','customer_value','location','days_since_last_activity','quote_value','booking_status')),
  operator text not null check (operator in ('EQ','NOT_EQ','GT','GTE','LT','LTE','CONTAINS')),
  comparison_value jsonb not null,
  foreign key (automation_id,business_id) references public.crm_automations(id,business_id) on delete cascade
);

create table public.crm_automation_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  automation_id uuid not null references public.crm_automations(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  action_type text not null check (action_type in ('CREATE_TASK','ADD_TAG','REMOVE_TAG','UPDATE_DEAL_STAGE','CREATE_INTERNAL_NOTE','CREATE_NOTIFICATION','CREATE_FOLLOW_UP','CALL_WEBHOOK')),
  action_config jsonb not null default '{}',
  foreign key (automation_id,business_id) references public.crm_automations(id,business_id) on delete cascade
);

create table public.crm_automation_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  automation_id uuid not null references public.crm_automations(id) on delete cascade,
  event_key text not null,
  status text not null check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  source_type text not null,
  source_id uuid,
  result_summary jsonb not null default '{}',
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id,automation_id,event_key),
  foreign key (automation_id,business_id) references public.crm_automations(id,business_id) on delete cascade
);
create index crm_automation_runs_recent_idx on public.crm_automation_runs(business_id,created_at desc);

create table public.outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  subscribed_events text[] not null default '{}',
  signing_secret_reference text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','DISABLED')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id)
);

create table public.webhook_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  webhook_id uuid not null references public.outbound_webhooks(id) on delete cascade,
  event_id uuid not null default gen_random_uuid(),
  event_type text not null,
  attempt integer not null default 1 check (attempt between 1 and 12),
  status text not null check (status in ('PENDING','DELIVERED','FAILED','RETRYING')),
  response_status integer,
  error_code text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (webhook_id,event_id,attempt),
  foreign key (webhook_id,business_id) references public.outbound_webhooks(id,business_id) on delete cascade
);

alter table public.integration_connections enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_event_links enable row level security;
alter table public.external_calendar_busy_blocks enable row level security;
alter table public.crm_automations enable row level security;
alter table public.crm_automation_conditions enable row level security;
alter table public.crm_automation_actions enable row level security;
alter table public.crm_automation_runs enable row level security;
alter table public.outbound_webhooks enable row level security;
alter table public.webhook_delivery_logs enable row level security;

do $$ declare t text; begin
  foreach t in array array['integration_connections','calendar_connections','calendar_event_links','external_calendar_busy_blocks','crm_automations','crm_automation_conditions','crm_automation_actions','crm_automation_runs','outbound_webhooks','webhook_delivery_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_business_member(business_id))',t||'_member_select',t);
  end loop;
end $$;

-- Configuration writes go through narrow RPCs. Provider callbacks and delivery workers use
-- service-role functions after verifying OAuth state/signatures and never return token data.
create or replace function public.crm_create_automation(p_business_id uuid,p_name text,p_trigger_type text,p_action_type text,p_action_config jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$ declare a uuid; begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if p_action_type not in ('CREATE_TASK','ADD_TAG','REMOVE_TAG','UPDATE_DEAL_STAGE','CREATE_INTERNAL_NOTE','CREATE_NOTIFICATION','CREATE_FOLLOW_UP','CALL_WEBHOOK') then raise exception 'Unsupported action'; end if;
  insert into public.crm_automations(business_id,name,trigger_type,created_by) values(p_business_id,trim(p_name),p_trigger_type,auth.uid()) returning id into a;
  insert into public.crm_automation_actions(business_id,automation_id,action_type,action_config) values(p_business_id,a,p_action_type,coalesce(p_action_config,'{}'));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'AUTOMATION_CREATED','crm_automation',a,jsonb_build_object('business_id',p_business_id));
  return a;
end $$;

create or replace function public.crm_set_automation_status(p_business_id uuid,p_automation_id uuid,p_status text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if p_status not in ('DRAFT','ACTIVE','PAUSED') then raise exception 'Invalid status'; end if;
  update public.crm_automations set status=p_status,updated_at=now() where id=p_automation_id and business_id=p_business_id;
  if not found then raise exception 'Automation not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),case when p_status='ACTIVE' then 'AUTOMATION_ENABLED' else 'AUTOMATION_DISABLED' end,'crm_automation',p_automation_id,jsonb_build_object('business_id',p_business_id,'status',p_status));
  return true;
end $$;

create or replace function public.crm_configure_calendar_connection(p_business_id uuid,p_connection_id uuid,p_import_busy boolean,p_export_marketplace boolean,p_export_crm boolean,p_export_tasks boolean,p_sync_direction text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  update public.calendar_connections set import_busy_time=p_import_busy,export_marketplace_bookings=p_export_marketplace,export_crm_bookings=p_export_crm,export_tasks=p_export_tasks,sync_direction=p_sync_direction,sync_enabled=true,updated_at=now() where id=p_connection_id and business_id=p_business_id;
  if not found then raise exception 'Connection not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'CALENDAR_SYNC_ENABLED','calendar_connection',p_connection_id,jsonb_build_object('business_id',p_business_id));
  return true;
end $$;

create or replace function private.reject_external_calendar_conflict() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  if new.status not in ('CANCELLED','NO_SHOW') and exists(
    select 1 from public.external_calendar_busy_blocks b join public.calendar_connections c on c.id=b.connection_id and c.business_id=b.business_id
    where b.business_id=new.business_id and b.status='BUSY' and c.sync_enabled and c.import_busy_time
      and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(new.scheduled_start,new.scheduled_end,'[)')
  ) then raise exception 'Booking conflicts with an external calendar busy time'; end if;
  return new;
end $$;
revoke all on function private.reject_external_calendar_conflict() from public,anon,authenticated;
drop trigger if exists crm_booking_external_calendar_conflict on public.crm_bookings;
create trigger crm_booking_external_calendar_conflict before insert or update of scheduled_start,scheduled_end,status on public.crm_bookings for each row execute function private.reject_external_calendar_conflict();

revoke all on function public.crm_create_automation(uuid,text,text,text,jsonb),public.crm_set_automation_status(uuid,uuid,text),public.crm_configure_calendar_connection(uuid,uuid,boolean,boolean,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.crm_create_automation(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.crm_set_automation_status(uuid,uuid,text) to authenticated;
grant execute on function public.crm_configure_calendar_connection(uuid,uuid,boolean,boolean,boolean,boolean,text) to authenticated;
