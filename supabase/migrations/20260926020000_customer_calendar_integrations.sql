-- Customer-owned calendar integrations for Everest Local.
-- Private event titles/descriptions are never persisted; imported events become opaque busy windows.

create table public.customer_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('APPLE_DEVICE','GOOGLE_CALENDAR')),
  provider_account_id text not null default 'primary',
  account_label text,
  status text not null default 'CONNECTED' check (status in ('PENDING','CONNECTED','NEEDS_ATTENTION','REVOKED')),
  granted_scopes text[] not null default '{}',
  provider_calendar_id text,
  calendar_label text,
  sync_enabled boolean not null default true,
  import_busy_time boolean not null default true,
  export_marketplace_bookings boolean not null default true,
  allow_ask_everest boolean not null default true,
  last_error_code text,
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id),
  unique (id, user_id)
);
create index customer_calendar_connections_user_idx
  on public.customer_calendar_connections(user_id, provider, status);

create table public.customer_calendar_oauth_credentials (
  connection_id uuid primary key references public.customer_calendar_connections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, user_id),
  foreign key (connection_id, user_id)
    references public.customer_calendar_connections(id, user_id) on delete cascade
);
alter table public.customer_calendar_oauth_credentials enable row level security;
revoke all on public.customer_calendar_oauth_credentials from public, anon, authenticated;

create table public.customer_calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.customer_calendar_connections(id) on delete cascade,
  external_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'BUSY' check (status in ('BUSY','CANCELLED')),
  privacy text not null default 'OPAQUE' check (privacy = 'OPAQUE'),
  safe_label text not null default 'Busy' check (safe_label = 'Busy'),
  provider_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (user_id, connection_id, external_event_id),
  check (ends_at > starts_at),
  foreign key (connection_id, user_id)
    references public.customer_calendar_connections(id, user_id) on delete cascade
);
create index customer_calendar_busy_blocks_range_idx
  on public.customer_calendar_busy_blocks(user_id, starts_at, ends_at)
  where status = 'BUSY';

create table public.customer_calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.customer_calendar_connections(id) on delete cascade,
  external_event_id text not null,
  marketplace_booking_id uuid not null references public.bookings(id) on delete cascade,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, connection_id, external_event_id),
  unique (user_id, connection_id, marketplace_booking_id),
  foreign key (connection_id, user_id)
    references public.customer_calendar_connections(id, user_id) on delete cascade
);
create index customer_calendar_event_links_booking_idx
  on public.customer_calendar_event_links(user_id, marketplace_booking_id);

alter table public.customer_calendar_connections enable row level security;
alter table public.customer_calendar_busy_blocks enable row level security;
alter table public.customer_calendar_event_links enable row level security;

revoke all on public.customer_calendar_connections from anon, authenticated;
revoke all on public.customer_calendar_busy_blocks from anon, authenticated;
revoke all on public.customer_calendar_event_links from anon, authenticated;

grant select, insert, update, delete on public.customer_calendar_connections to authenticated;
grant select, insert, update, delete on public.customer_calendar_busy_blocks to authenticated;
grant select, insert, update, delete on public.customer_calendar_event_links to authenticated;

create policy customer_calendar_connections_own_select
  on public.customer_calendar_connections for select to authenticated
  using ((select auth.uid()) = user_id);
create policy customer_calendar_connections_own_insert
  on public.customer_calendar_connections for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy customer_calendar_connections_own_update
  on public.customer_calendar_connections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy customer_calendar_connections_own_delete
  on public.customer_calendar_connections for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy customer_calendar_busy_blocks_own_select
  on public.customer_calendar_busy_blocks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy customer_calendar_busy_blocks_own_insert
  on public.customer_calendar_busy_blocks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy customer_calendar_busy_blocks_own_update
  on public.customer_calendar_busy_blocks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy customer_calendar_busy_blocks_own_delete
  on public.customer_calendar_busy_blocks for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy customer_calendar_event_links_own_select
  on public.customer_calendar_event_links for select to authenticated
  using ((select auth.uid()) = user_id);
create policy customer_calendar_event_links_own_insert
  on public.customer_calendar_event_links for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.bookings b
      where b.id = marketplace_booking_id
        and b.customer_id = (select auth.uid())
    )
  );
create policy customer_calendar_event_links_own_update
  on public.customer_calendar_event_links for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.bookings b
      where b.id = marketplace_booking_id
        and b.customer_id = (select auth.uid())
    )
  );
create policy customer_calendar_event_links_own_delete
  on public.customer_calendar_event_links for delete to authenticated
  using ((select auth.uid()) = user_id);
