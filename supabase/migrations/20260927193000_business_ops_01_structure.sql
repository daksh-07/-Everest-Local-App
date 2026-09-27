-- Everest Business Operations: multi-employee organizations, RBAC, teams, dispatch and staff workspaces.
-- Businesses remain the legal/commercial root. Human identity remains in profiles/auth.users.
-- This migration is additive and hardens existing member-wide access for employee-safe operation.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- STRUCTURE ----------

create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  address_line text,
  suburb text,
  city text,
  state text,
  postcode text,
  country text not null default 'Australia',
  latitude numeric,
  longitude numeric,
  timezone text not null default 'Australia/Sydney',
  is_primary boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,business_id)
);
create unique index if not exists business_locations_one_primary_idx
  on public.business_locations(business_id) where is_primary and active;
create index if not exists business_locations_business_idx
  on public.business_locations(business_id,active,name);

alter table public.business_members
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists display_name text,
  add column if not exists job_title text,
  add column if not exists employee_number text,
  add column if not exists location_id uuid,
  add column if not exists is_dispatchable boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.business_members drop constraint if exists business_members_status_check;
alter table public.business_members add constraint business_members_status_check
  check (status in ('ACTIVE','SUSPENDED','REMOVED'));

alter table public.business_members drop constraint if exists business_members_role_check;
alter table public.business_members add constraint business_members_role_check check (
  member_role in (
    'OWNER','ADMIN','OPERATIONS_MANAGER','DISPATCHER','FINANCE','CRM_SALES',
    'TEAM_LEADER','TECHNICIAN','CONTRACTOR','READ_ONLY','MANAGER','STAFF'
  )
);

alter table public.business_members drop constraint if exists business_members_location_business_fk;
alter table public.business_members add constraint business_members_location_business_fk
  foreign key(location_id,business_id)
  references public.business_locations(id,business_id)
  on delete restrict;

create unique index if not exists business_members_employee_number_uidx
  on public.business_members(business_id,lower(employee_number))
  where employee_number is not null and status='ACTIVE';
create index if not exists business_members_business_status_idx
  on public.business_members(business_id,status,member_role);
create index if not exists business_members_user_status_idx
  on public.business_members(user_id,status,business_id);

create table if not exists public.business_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  member_role text not null check (
    member_role in (
      'ADMIN','OPERATIONS_MANAGER','DISPATCHER','FINANCE','CRM_SALES',
      'TEAM_LEADER','TECHNICIAN','CONTRACTOR','READ_ONLY','MANAGER','STAFF'
    )
  ),
  display_name text,
  job_title text,
  employee_number text,
  location_id uuid,
  is_dispatchable boolean not null default false,
  status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','DECLINED','REVOKED','EXPIRED')),
  invited_by uuid not null references public.profiles(id),
  accepted_by uuid references public.profiles(id),
  expires_at timestamptz not null default (now()+interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(location_id,business_id) references public.business_locations(id,business_id) on delete restrict
);
create unique index if not exists business_staff_invitations_pending_uidx
  on public.business_staff_invitations(business_id,lower(email))
  where status='PENDING';
create index if not exists business_staff_invitations_email_idx
  on public.business_staff_invitations(lower(email),status,expires_at);

create table if not exists public.business_member_permission_overrides (
  business_id uuid not null,
  user_id uuid not null,
  permission text not null,
  allowed boolean not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(business_id,user_id,permission),
  foreign key(business_id,user_id) references public.business_members(business_id,user_id) on delete cascade
);

create table if not exists public.business_teams (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid,
  name text not null check(char_length(trim(name)) between 1 and 100),
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,business_id),
  unique(business_id,name),
  foreign key(location_id,business_id) references public.business_locations(id,business_id) on delete restrict
);
create index if not exists business_teams_business_idx on public.business_teams(business_id,active,name);

create table if not exists public.business_team_members (
  business_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  team_role text not null default 'MEMBER' check(team_role in ('LEAD','MEMBER')),
  created_at timestamptz not null default now(),
  primary key(team_id,user_id),
  foreign key(team_id,business_id) references public.business_teams(id,business_id) on delete cascade,
  foreign key(business_id,user_id) references public.business_members(business_id,user_id) on delete cascade
);
create index if not exists business_team_members_user_idx on public.business_team_members(business_id,user_id,team_id);

create table if not exists public.business_member_skills (
  business_id uuid not null,
  user_id uuid not null,
  service_id uuid not null references public.services(id) on delete cascade,
  level text not null default 'QUALIFIED' check(level in ('TRAINEE','QUALIFIED','LEAD')),
  active boolean not null default true,
  expires_at date,
  created_at timestamptz not null default now(),
  primary key(business_id,user_id,service_id),
  foreign key(business_id,user_id) references public.business_members(business_id,user_id) on delete cascade
);
create index if not exists business_member_skills_service_idx on public.business_member_skills(business_id,service_id,active);

create table if not exists public.business_staff_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null,
  location_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'SCHEDULED' check(status in ('SCHEDULED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','LEAVE')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at>starts_at),
  foreign key(business_id,user_id) references public.business_members(business_id,user_id) on delete cascade,
  foreign key(location_id,business_id) references public.business_locations(id,business_id) on delete restrict
);
create index if not exists business_staff_shifts_user_time_idx on public.business_staff_shifts(business_id,user_id,starts_at,ends_at);
create index if not exists business_staff_shifts_business_time_idx on public.business_staff_shifts(business_id,starts_at,ends_at,status);

create table if not exists public.business_job_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  crm_booking_id uuid references public.crm_bookings(id) on delete cascade,
  assigned_user_id uuid,
  team_id uuid,
  assignment_role text not null default 'PRIMARY' check(assignment_role in ('PRIMARY','SUPPORT')),
  status text not null default 'ASSIGNED'
    check(status in ('ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','DECLINED','CANCELLED')),
  assigned_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(num_nonnulls(booking_id,crm_booking_id)=1),
  check(num_nonnulls(assigned_user_id,team_id)=1),
  foreign key(business_id,assigned_user_id) references public.business_members(business_id,user_id) on delete cascade,
  foreign key(team_id,business_id) references public.business_teams(id,business_id) on delete cascade
);
create unique index if not exists business_job_assignments_marketplace_active_uidx
  on public.business_job_assignments(booking_id)
  where booking_id is not null and status not in ('DECLINED','CANCELLED');
create unique index if not exists business_job_assignments_crm_active_uidx
  on public.business_job_assignments(crm_booking_id)
  where crm_booking_id is not null and status not in ('DECLINED','CANCELLED');
create index if not exists business_job_assignments_staff_idx
  on public.business_job_assignments(business_id,assigned_user_id,status,updated_at desc);
create index if not exists business_job_assignments_team_idx
  on public.business_job_assignments(business_id,team_id,status,updated_at desc);

create table if not exists public.business_job_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  assignment_id uuid references public.business_job_assignments(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  crm_booking_id uuid references public.crm_bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check(num_nonnulls(booking_id,crm_booking_id)<=1)
);
create index if not exists business_job_events_job_idx
  on public.business_job_events(business_id,booking_id,crm_booking_id,created_at desc);

-- Backfill a primary branch from the existing business address without changing the public profile.
insert into public.business_locations(
  business_id,name,address_line,suburb,city,state,postcode,country,latitude,longitude,is_primary,created_by
)
select b.id,'Main',b.address_line,b.suburb,b.city,b.state,b.postcode,coalesce(nullif(b.country,''),'Australia'),b.latitude,b.longitude,true,b.owner_id
from public.businesses b
where not exists(select 1 from public.business_locations l where l.business_id=b.id)
on conflict do nothing;

update public.business_members bm
set location_id=(
  select l.id from public.business_locations l
  where l.business_id=bm.business_id and l.is_primary and l.active
  order by l.created_at limit 1
)
where bm.location_id is null;

