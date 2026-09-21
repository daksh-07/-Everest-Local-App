alter table public.service_dispatch_assignments
  add column if not exists service_request_id uuid,
  add column if not exists booking_id uuid;

update public.service_dispatch_assignments a
set service_request_id=j.request_id,
    booking_id=b.id
from public.service_dispatch_jobs j
join public.bookings b on b.request_id=j.request_id
where a.job_id=j.id and a.service_request_id is null;

alter table public.service_dispatch_assignments
  alter column service_request_id set not null,
  alter column booking_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='service_dispatch_assignments_job_request_fk') then
    alter table public.service_dispatch_assignments
      add constraint service_dispatch_assignments_job_request_fk
      foreign key (job_id, service_request_id)
      references public.service_dispatch_jobs(id, request_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='service_dispatch_assignments_booking_request_fk') then
    alter table public.service_dispatch_assignments
      add constraint service_dispatch_assignments_booking_request_fk
      foreign key (booking_id, service_request_id)
      references public.bookings(id, request_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='service_dispatch_assignments_job_id_key') then
    alter table public.service_dispatch_assignments
      add constraint service_dispatch_assignments_job_id_key unique(job_id);
  end if;
end $$;

create index if not exists service_dispatch_assignments_request_idx
  on public.service_dispatch_assignments(service_request_id);
create index if not exists service_dispatch_assignments_booking_idx
  on public.service_dispatch_assignments(booking_id);