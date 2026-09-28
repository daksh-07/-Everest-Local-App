-- Everest Local remote push delivery for urgent business work.
-- Client tokens are RPC-managed only. Database-triggered delivery uses a generated secret
-- and stays disabled until the environment-specific Edge Function URL is configured.

create extension if not exists pg_net with schema extensions;
create schema if not exists private;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('IOS','ANDROID')),
  device_name text,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(expo_push_token) between 20 and 512)
);
create index if not exists device_push_tokens_user_enabled_idx
  on public.device_push_tokens(user_id,enabled,last_seen_at desc);

create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  push_token_id uuid not null references public.device_push_tokens(id) on delete cascade,
  status text not null check (status in ('SENT_TO_EXPO','FAILED','DEVICE_NOT_REGISTERED')),
  expo_ticket_id text,
  error_code text,
  attempted_at timestamptz not null default now(),
  unique(notification_id,push_token_id)
);
create index if not exists push_delivery_attempts_notification_idx
  on public.push_delivery_attempts(notification_id,attempted_at desc);

create table if not exists private.push_dispatch_config (
  id boolean primary key default true check (id),
  shared_secret text not null,
  endpoint text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.push_dispatch_config(id,shared_secret,endpoint,enabled)
select true,encode(gen_random_bytes(32),'hex'),null,false
where not exists(select 1 from private.push_dispatch_config where id=true);

alter table public.device_push_tokens enable row level security;
alter table public.push_delivery_attempts enable row level security;
revoke all on public.device_push_tokens,public.push_delivery_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.device_push_tokens,public.push_delivery_attempts to service_role;

create or replace function public.register_my_push_token(
  p_expo_push_token text,
  p_platform text,
  p_device_name text default null,
  p_app_version text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_token text:=trim(coalesce(p_expo_push_token,''));
  v_platform text:=upper(trim(coalesce(p_platform,'')));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_platform not in ('IOS','ANDROID') then raise exception 'Unsupported push platform'; end if;
  if length(v_token)<20 or length(v_token)>512 then raise exception 'Invalid push token'; end if;
  if v_token not like 'ExponentPushToken[%]' and v_token not like 'ExpoPushToken[%]' then
    raise exception 'Unsupported push token';
  end if;

  insert into public.device_push_tokens(
    user_id,expo_push_token,platform,device_name,app_version,enabled,last_seen_at,updated_at
  ) values(
    v_uid,v_token,v_platform,nullif(trim(coalesce(p_device_name,'')),''),
    nullif(trim(coalesce(p_app_version,'')),''),true,now(),now()
  )
  on conflict(expo_push_token) do update set
    user_id=v_uid,
    platform=excluded.platform,
    device_name=excluded.device_name,
    app_version=excluded.app_version,
    enabled=true,
    last_seen_at=now(),
    updated_at=now()
  returning id into v_id;

  return v_id;
end
$$;
revoke all on function public.register_my_push_token(text,text,text,text) from public,anon;
grant execute on function public.register_my_push_token(text,text,text,text) to authenticated;

create or replace function public.disable_my_push_token(p_expo_push_token text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.device_push_tokens
  set enabled=false,updated_at=now()
  where user_id=auth.uid() and expo_push_token=trim(coalesce(p_expo_push_token,''));
  return found;
end
$$;
revoke all on function public.disable_my_push_token(text) from public,anon;
grant execute on function public.disable_my_push_token(text) to authenticated;

create or replace function public.get_my_push_status()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'enabled_devices',count(*) filter(where enabled),
    'last_seen_at',max(last_seen_at)
  )
  from public.device_push_tokens
  where user_id=auth.uid()
$$;
revoke all on function public.get_my_push_status() from public,anon;
grant execute on function public.get_my_push_status() to authenticated;

create or replace function public.verify_push_dispatch_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from private.push_dispatch_config c
    where c.id=true
      and c.enabled
      and c.endpoint is not null
      and length(coalesce(p_secret,''))=length(c.shared_secret)
      and p_secret=c.shared_secret
  )
$$;
revoke all on function public.verify_push_dispatch_secret(text) from public,anon,authenticated;
grant execute on function public.verify_push_dispatch_secret(text) to service_role;

create or replace function private.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  c private.push_dispatch_config;
begin
  if new.kind not in ('EVEREST_LIVE_REQUEST','SERVICE_DISPATCH_OFFER','NEW_OPPORTUNITY','BOOKING_CONFIRMED') then
    return new;
  end if;

  if not exists(
    select 1 from public.device_push_tokens t
    where t.user_id=new.user_id and t.enabled
  ) then
    return new;
  end if;

  select * into c from private.push_dispatch_config where id=true;
  if c.id is null or not c.enabled or c.endpoint is null then
    return new;
  end if;

  perform net.http_post(
    url:=c.endpoint,
    body:=jsonb_build_object('notificationId',new.id),
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'X-Everest-Push-Secret',c.shared_secret
    ),
    timeout_milliseconds:=3000
  );
  return new;
exception when others then
  -- Push delivery must never roll back an authoritative marketplace transaction.
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(null,'PUSH_DISPATCH_ENQUEUE_FAILED','NOTIFICATION',new.id,jsonb_build_object('sqlstate',sqlstate));
  return new;
end
$$;
revoke all on function private.enqueue_notification_push() from public,anon,authenticated;

drop trigger if exists trg_notifications_remote_push on public.notifications;
create trigger trg_notifications_remote_push
after insert on public.notifications
for each row execute function private.enqueue_notification_push();

create or replace function private.disable_stale_push_tokens()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare n integer;
begin
  update public.device_push_tokens
  set enabled=false,updated_at=now()
  where enabled and last_seen_at<now()-interval '120 days';
  get diagnostics n=row_count;
  return n;
end
$$;
revoke all on function private.disable_stale_push_tokens() from public,anon,authenticated;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='everest-disable-stale-push-tokens';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'everest-disable-stale-push-tokens',
    '17 3 * * *',
    'select private.disable_stale_push_tokens();'
  );
end
$$;
