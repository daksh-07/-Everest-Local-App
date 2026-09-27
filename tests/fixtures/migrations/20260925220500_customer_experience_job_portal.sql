-- A booking remains the authoritative commercial record. This table adds the
-- operational progress that customers and verified businesses share.
create table if not exists public.booking_job_records (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  arrival_status text not null default 'NOT_STARTED'
    check (arrival_status in ('NOT_STARTED','ON_MY_WAY','ARRIVED','IN_PROGRESS','COMPLETED')),
  arrival_eta timestamptz,
  completion_summary text check (completion_summary is null or char_length(completion_summary) <= 2000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking_job_records(booking_id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 160),
  is_complete boolean not null default false,
  position integer not null default 0 check (position >= 0),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_job_records_business_idx on public.booking_job_records(business_id, updated_at desc);
create index if not exists booking_job_records_customer_idx on public.booking_job_records(customer_id, updated_at desc);
create index if not exists booking_job_checklist_booking_idx on public.booking_job_checklist_items(booking_id, position, created_at);

alter table public.booking_job_records enable row level security;
alter table public.booking_job_checklist_items enable row level security;

create policy booking_job_records_participant_read on public.booking_job_records
  for select to authenticated
  using (customer_id = auth.uid() or public.is_business_member(business_id) or public.is_admin());

create policy booking_job_checklist_participant_read on public.booking_job_checklist_items
  for select to authenticated
  using (
    exists (
      select 1 from public.booking_job_records r
      where r.booking_id = booking_job_checklist_items.booking_id
        and (r.customer_id = auth.uid() or public.is_business_member(r.business_id) or public.is_admin())
    )
  );

revoke insert, update, delete on public.booking_job_records from anon, authenticated;
revoke insert, update, delete on public.booking_job_checklist_items from anon, authenticated;
grant select on public.booking_job_records to authenticated;
grant select on public.booking_job_checklist_items to authenticated;

create or replace function public.ensure_booking_job_record(p_booking_id uuid)
returns public.booking_job_records
language plpgsql security definer set search_path = public
as $$
declare b public.bookings; result public.booking_job_records;
begin
  select * into b from public.bookings where id = p_booking_id;
  if b.id is null then raise exception 'Booking not found'; end if;
  if not (public.is_business_member(b.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  insert into public.booking_job_records(booking_id, business_id, customer_id)
  values (b.id, b.business_id, b.customer_id)
  on conflict (booking_id) do nothing;
  select * into result from public.booking_job_records where booking_id = b.id;
  return result;
end;
$$;

create or replace function public.set_booking_job_progress(
  p_booking_id uuid,
  p_arrival_status text,
  p_arrival_eta timestamptz default null,
  p_completion_summary text default null
) returns public.booking_job_records
language plpgsql security definer set search_path = public
as $$
declare b public.bookings; result public.booking_job_records;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then raise exception 'Booking not found'; end if;
  if not (public.is_business_member(b.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  if p_arrival_status not in ('NOT_STARTED','ON_MY_WAY','ARRIVED','IN_PROGRESS','COMPLETED') then raise exception 'Invalid job progress'; end if;
  if p_arrival_status = 'IN_PROGRESS' and b.status not in ('UPCOMING','IN_PROGRESS') then raise exception 'Booking is not ready to start'; end if;
  if p_arrival_status = 'COMPLETED' and b.status not in ('IN_PROGRESS','COMPLETED') then raise exception 'Booking is not in progress'; end if;

  insert into public.booking_job_records(booking_id, business_id, customer_id, arrival_status, arrival_eta, completion_summary, started_at, completed_at)
  values (
    b.id, b.business_id, b.customer_id, p_arrival_status, p_arrival_eta,
    nullif(trim(coalesce(p_completion_summary, '')), ''),
    case when p_arrival_status in ('IN_PROGRESS','COMPLETED') then now() end,
    case when p_arrival_status = 'COMPLETED' then now() end
  )
  on conflict (booking_id) do update set
    arrival_status = excluded.arrival_status,
    arrival_eta = excluded.arrival_eta,
    completion_summary = coalesce(excluded.completion_summary, booking_job_records.completion_summary),
    started_at = coalesce(booking_job_records.started_at, excluded.started_at),
    completed_at = coalesce(excluded.completed_at, booking_job_records.completed_at),
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.add_booking_job_checklist_item(p_booking_id uuid, p_label text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare b public.bookings; new_id uuid;
begin
  select * into b from public.bookings where id = p_booking_id;
  if b.id is null then raise exception 'Booking not found'; end if;
  if not (public.is_business_member(b.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  if char_length(trim(coalesce(p_label, ''))) not between 1 and 160 then raise exception 'Checklist item is required'; end if;
  perform public.ensure_booking_job_record(b.id);
  insert into public.booking_job_checklist_items(booking_id, business_id, label, position)
  select b.id, b.business_id, trim(p_label), coalesce(max(position), -1) + 1
  from public.booking_job_checklist_items where booking_id = b.id
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.set_booking_job_checklist_item(p_item_id uuid, p_is_complete boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare item public.booking_job_checklist_items;
begin
  select * into item from public.booking_job_checklist_items where id = p_item_id for update;
  if item.id is null then raise exception 'Checklist item not found'; end if;
  if not (public.is_business_member(item.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  update public.booking_job_checklist_items set
    is_complete = p_is_complete,
    completed_at = case when p_is_complete then now() else null end,
    completed_by = case when p_is_complete then auth.uid() else null end,
    updated_at = now()
  where id = item.id;
  return true;
end;
$$;

revoke all on function public.ensure_booking_job_record(uuid) from public, anon;
revoke all on function public.set_booking_job_progress(uuid,text,timestamptz,text) from public, anon;
revoke all on function public.add_booking_job_checklist_item(uuid,text) from public, anon;
revoke all on function public.set_booking_job_checklist_item(uuid,boolean) from public, anon;
grant execute on function public.ensure_booking_job_record(uuid) to authenticated;
grant execute on function public.set_booking_job_progress(uuid,text,timestamptz,text) to authenticated;
grant execute on function public.add_booking_job_checklist_item(uuid,text) to authenticated;
grant execute on function public.set_booking_job_checklist_item(uuid,boolean) to authenticated;

comment on table public.booking_job_records is 'Participant-visible operational progress for an authoritative Everest booking.';
comment on column public.booking_job_records.arrival_eta is 'Optional business-provided ETA; never inferred or fabricated.';
