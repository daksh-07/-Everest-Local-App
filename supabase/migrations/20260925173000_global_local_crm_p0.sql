-- Everest Local P0: real-time availability, verified work provenance and tenant-isolated business CRM.
-- Additive only. Public marketplace data remains separate from private CRM data.

create table if not exists public.business_availability (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  status text not null default 'OFFLINE' check (status in ('AVAILABLE_NOW','AVAILABLE_LATER','BUSY','OFFLINE')),
  available_from timestamptz,
  available_until timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (available_until is null or available_from is null or available_until > available_from)
);

create table if not exists public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  linked_everest_user_id uuid references public.profiles(id) on delete set null,
  first_name text,
  last_name text,
  display_name text not null,
  phone text,
  email text,
  company text,
  source text not null default 'MANUAL',
  source_detail text,
  suburb text,
  city text,
  state text,
  country text,
  notes text,
  tags text[] not null default '{}',
  lifecycle_stage text not null default 'LEAD' check (lifecycle_stage in ('LEAD','CUSTOMER','PAST_CUSTOMER','ARCHIVED')),
  lead_status text not null default 'NEW_LEAD' check (lead_status in ('NEW_LEAD','CONTACTED','QUALIFIED','QUOTE_SENT','FOLLOW_UP','WON','LOST')),
  estimated_value numeric check (estimated_value is null or estimated_value >= 0),
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists business_contacts_linked_user_uidx
  on public.business_contacts(business_id,linked_everest_user_id)
  where linked_everest_user_id is not null;
create index if not exists business_contacts_business_stage_idx on public.business_contacts(business_id,lead_status,updated_at desc);
create index if not exists business_contacts_email_idx on public.business_contacts(business_id,lower(email)) where email is not null;
create index if not exists business_contacts_phone_idx on public.business_contacts(business_id,regexp_replace(coalesce(phone,''),'\D','','g')) where phone is not null;

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  source_record_type text,
  source_record_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_contact_time_idx on public.crm_activities(business_id,contact_id,occurred_at desc);

create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_notes_contact_time_idx on public.crm_notes(business_id,contact_id,created_at desc);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.business_contacts(id) on delete cascade,
  task text not null check (length(trim(task)) between 1 and 1000),
  due_at timestamptz not null,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_tasks_due_idx on public.crm_tasks(business_id,status,due_at);

create table if not exists public.crm_external_quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED')),
  subtotal numeric not null default 0 check (subtotal >= 0),
  tax numeric not null default 0 check (tax >= 0),
  total numeric not null default 0 check (total >= 0),
  notes text,
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_external_quotes_contact_idx on public.crm_external_quotes(business_id,contact_id,created_at desc);

create table if not exists public.crm_external_quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_id uuid not null references public.crm_external_quotes(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 1000),
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now()
);
create index if not exists crm_external_quote_items_quote_idx on public.crm_external_quote_items(business_id,quote_id);

create table if not exists public.crm_external_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete cascade,
  external_quote_id uuid references public.crm_external_quotes(id) on delete set null,
  service_label text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  status text not null default 'CONFIRMED' check (status in ('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED')),
  location_label text,
  amount numeric check (amount is null or amount >= 0),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID','PARTIAL','PAID','REFUNDED')),
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end is null or scheduled_end > scheduled_start)
);
create index if not exists crm_external_bookings_calendar_idx on public.crm_external_bookings(business_id,scheduled_start,status);
create index if not exists crm_external_bookings_contact_idx on public.crm_external_bookings(business_id,contact_id,scheduled_start desc);

-- Same-tenant relational integrity: a child row cannot point at another business's contact/quote.
alter table public.business_contacts drop constraint if exists business_contacts_id_business_unique;
alter table public.business_contacts add constraint business_contacts_id_business_unique unique(id,business_id);
alter table public.crm_external_quotes drop constraint if exists crm_external_quotes_id_business_unique;
alter table public.crm_external_quotes add constraint crm_external_quotes_id_business_unique unique(id,business_id);

alter table public.crm_activities drop constraint if exists crm_activities_contact_business_fk;
alter table public.crm_activities add constraint crm_activities_contact_business_fk foreign key(contact_id,business_id) references public.business_contacts(id,business_id) on delete cascade;
alter table public.crm_notes drop constraint if exists crm_notes_contact_business_fk;
alter table public.crm_notes add constraint crm_notes_contact_business_fk foreign key(contact_id,business_id) references public.business_contacts(id,business_id) on delete cascade;
alter table public.crm_tasks drop constraint if exists crm_tasks_contact_business_fk;
alter table public.crm_tasks add constraint crm_tasks_contact_business_fk foreign key(contact_id,business_id) references public.business_contacts(id,business_id) on delete cascade;
alter table public.crm_external_quotes drop constraint if exists crm_external_quotes_contact_business_fk;
alter table public.crm_external_quotes add constraint crm_external_quotes_contact_business_fk foreign key(contact_id,business_id) references public.business_contacts(id,business_id) on delete cascade;
alter table public.crm_external_quote_items drop constraint if exists crm_external_quote_items_quote_business_fk;
alter table public.crm_external_quote_items add constraint crm_external_quote_items_quote_business_fk foreign key(quote_id,business_id) references public.crm_external_quotes(id,business_id) on delete cascade;
alter table public.crm_external_bookings drop constraint if exists crm_external_bookings_contact_business_fk;
alter table public.crm_external_bookings add constraint crm_external_bookings_contact_business_fk foreign key(contact_id,business_id) references public.business_contacts(id,business_id) on delete cascade;
alter table public.crm_external_bookings drop constraint if exists crm_external_bookings_quote_business_fk;
alter table public.crm_external_bookings add constraint crm_external_bookings_quote_business_fk foreign key(external_quote_id,business_id) references public.crm_external_quotes(id,business_id) on delete set null;

-- Public marker contains no private booking/customer identifier. The private link is server-only.
create table if not exists public.verified_work_posts (
  post_id uuid primary key references public.posts(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  verified_at timestamptz not null default now()
);
create table if not exists public.verified_work_post_links (
  post_id uuid primary key references public.posts(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.business_availability enable row level security;
alter table public.business_contacts enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_external_quotes enable row level security;
alter table public.crm_external_quote_items enable row level security;
alter table public.crm_external_bookings enable row level security;
alter table public.verified_work_posts enable row level security;
alter table public.verified_work_post_links enable row level security;

revoke all on public.business_availability,public.business_contacts,public.crm_activities,public.crm_notes,public.crm_tasks,public.crm_external_quotes,public.crm_external_quote_items,public.crm_external_bookings,public.verified_work_posts,public.verified_work_post_links from anon;
revoke all on public.business_contacts,public.crm_activities,public.crm_notes,public.crm_tasks,public.crm_external_quotes,public.crm_external_quote_items,public.crm_external_bookings,public.verified_work_post_links from authenticated;

grant select on public.business_availability,public.verified_work_posts to anon,authenticated;
grant insert,update,delete on public.business_availability to authenticated;
grant select,insert,update,delete on public.business_contacts,public.crm_activities,public.crm_notes,public.crm_tasks,public.crm_external_quotes,public.crm_external_quote_items,public.crm_external_bookings to authenticated;

drop policy if exists business_availability_public_read on public.business_availability;
create policy business_availability_public_read on public.business_availability for select
to anon,authenticated
using (exists(select 1 from public.businesses b where b.id=business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'));
drop policy if exists business_availability_member_write on public.business_availability;
create policy business_availability_member_write on public.business_availability for all
to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

drop policy if exists verified_work_posts_public_read on public.verified_work_posts;
create policy verified_work_posts_public_read on public.verified_work_posts for select
to anon,authenticated
using (exists(select 1 from public.posts p where p.id=post_id and p.status='PUBLISHED'));

-- Tenant isolation for every private CRM table.
drop policy if exists business_contacts_member_all on public.business_contacts;
create policy business_contacts_member_all on public.business_contacts for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists crm_activities_member_all on public.crm_activities;
create policy crm_activities_member_all on public.crm_activities for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists crm_notes_member_all on public.crm_notes;
create policy crm_notes_member_all on public.crm_notes for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists crm_tasks_member_all on public.crm_tasks;
create policy crm_tasks_member_all on public.crm_tasks for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists crm_external_quotes_member_all on public.crm_external_quotes;
create policy crm_external_quotes_member_all on public.crm_external_quotes for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists crm_external_quote_items_member_all on public.crm_external_quote_items;
create policy crm_external_quote_items_member_all on public.crm_external_quote_items for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists crm_external_bookings_member_all on public.crm_external_bookings;
create policy crm_external_bookings_member_all on public.crm_external_bookings for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create or replace function public.crm_touch_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists business_contacts_touch on public.business_contacts;
create trigger business_contacts_touch before update on public.business_contacts for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_notes_touch on public.crm_notes;
create trigger crm_notes_touch before update on public.crm_notes for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_tasks_touch on public.crm_tasks;
create trigger crm_tasks_touch before update on public.crm_tasks for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_external_quotes_touch on public.crm_external_quotes;
create trigger crm_external_quotes_touch before update on public.crm_external_quotes for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_external_bookings_touch on public.crm_external_bookings;
create trigger crm_external_bookings_touch before update on public.crm_external_bookings for each row execute function public.crm_touch_updated_at();

create or replace function public.set_business_availability(
  p_business_id uuid,p_status text,p_available_from timestamptz default null,p_available_until timestamptz default null
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_status not in ('AVAILABLE_NOW','AVAILABLE_LATER','BUSY','OFFLINE') then raise exception 'Invalid availability'; end if;
 if p_available_until is not null and p_available_from is not null and p_available_until<=p_available_from then raise exception 'Invalid availability window'; end if;
 insert into public.business_availability(business_id,status,available_from,available_until,updated_by,updated_at)
 values(p_business_id,p_status,p_available_from,p_available_until,auth.uid(),now())
 on conflict(business_id) do update set status=excluded.status,available_from=excluded.available_from,available_until=excluded.available_until,updated_by=auth.uid(),updated_at=now();
 return true;
end $$;
revoke all on function public.set_business_availability(uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.set_business_availability(uuid,text,timestamptz,timestamptz) to authenticated;

create or replace function public.create_business_contact(
 p_business_id uuid,p_display_name text,p_phone text default null,p_email text default null,p_source text default 'MANUAL',
 p_source_detail text default null,p_estimated_value numeric default null,p_notes text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_display_name,'')))<1 then raise exception 'Customer name is required'; end if;
 if p_estimated_value is not null and p_estimated_value<0 then raise exception 'Invalid estimated value'; end if;
 insert into public.business_contacts(business_id,display_name,phone,email,source,source_detail,estimated_value,notes,created_by)
 values(p_business_id,trim(p_display_name),nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),coalesce(nullif(trim(p_source),''),'MANUAL'),nullif(trim(p_source_detail),''),p_estimated_value,nullif(trim(p_notes),''),auth.uid())
 returning id into cid;
 insert into public.crm_activities(business_id,contact_id,kind,title,detail,created_by)
 values(p_business_id,cid,'LEAD_CREATED','Lead created','Source: '||coalesce(nullif(trim(p_source),''),'MANUAL'),auth.uid());
 return cid;
end $$;
revoke all on function public.create_business_contact(uuid,text,text,text,text,text,numeric,text) from public,anon;
grant execute on function public.create_business_contact(uuid,text,text,text,text,text,numeric,text) to authenticated;

create or replace function public.find_business_contact_duplicates(p_business_id uuid,p_email text default null,p_phone text default null)
returns table(id uuid,display_name text,email text,phone text,reason text)
language sql security definer set search_path='' as $$
 select c.id,c.display_name,c.email,c.phone,
   case when p_email is not null and c.email is not null and lower(c.email)=lower(trim(p_email)) then 'EMAIL'
        when p_phone is not null and c.phone is not null and regexp_replace(c.phone,'\D','','g')=regexp_replace(p_phone,'\D','','g') then 'PHONE'
        else 'POSSIBLE' end
 from public.business_contacts c
 where c.business_id=p_business_id and public.is_business_member(p_business_id)
   and ((p_email is not null and c.email is not null and lower(c.email)=lower(trim(p_email)))
     or (p_phone is not null and c.phone is not null and regexp_replace(c.phone,'\D','','g')=regexp_replace(p_phone,'\D','','g')))
 limit 10
$$;
revoke all on function public.find_business_contact_duplicates(uuid,text,text) from public,anon;
grant execute on function public.find_business_contact_duplicates(uuid,text,text) to authenticated;

create or replace function public.publish_verified_work_post(
 p_booking_id uuid,p_caption text,p_location_label text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.bookings; pid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into b from public.bookings where id=p_booking_id and status='COMPLETED';
 if b.id is null then raise exception 'Only completed Everest bookings are eligible'; end if;
 if b.customer_id<>auth.uid() and not public.is_business_member(b.business_id) then raise exception 'Not authorized'; end if;
 if exists(select 1 from public.verified_work_post_links l where l.booking_id=p_booking_id) then raise exception 'This booking has already been shared as verified work'; end if;
 insert into public.posts(author_id,business_id,caption,post_type,visibility,status,location_label)
 values(auth.uid(),case when public.is_business_member(b.business_id) then b.business_id else null end,nullif(trim(p_caption),''),'COMPLETED_WORK','PUBLIC','PUBLISHED',nullif(trim(p_location_label),''))
 returning id into pid;
 insert into public.verified_work_post_links(post_id,booking_id,customer_id,business_id)
 values(pid,b.id,b.customer_id,b.business_id);
 insert into public.verified_work_posts(post_id,business_id) values(pid,b.business_id);
 return pid;
end $$;
revoke all on function public.publish_verified_work_post(uuid,text,text) from public,anon;
grant execute on function public.publish_verified_work_post(uuid,text,text) to authenticated;
