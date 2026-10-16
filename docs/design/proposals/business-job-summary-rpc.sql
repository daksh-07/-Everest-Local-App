-- PROPOSAL ONLY — not in supabase/migrations, not applied. Requires backend owner + security review.
--
-- Problem: Business Jobs and the job workspace can show only date, time, price and status.
-- Bookings carry no title, and the client must not read service_requests or profiles directly
-- from Business mode (RLS on those tables was not designed for business-side reads, and widening
-- it would expose more than a job needs).
--
-- Minimum safe change: one read-only RPC that returns a fixed, minimal projection for a single
-- booking, authorised by the existing can_operate_business_booking() (owners/managers with
-- JOB_UPDATE_ALL, or the assigned worker/crew). No new table grants, no RLS changes.
--
-- Returned fields and why each is needed:
--   service_label        what the job is (service name, else category name)          → row title
--   request_summary      first 140 chars of the customer's own description          → context
--   customer_first_name  first name only (no surname, email, phone, address)         → greeting
--   service_suburb       suburb only; the exact address stays behind the existing
--                        get_booking_service_location() rules                        → planning
create or replace function public.get_business_job_summary(p_booking_id uuid)
returns table(booking_id uuid, service_label text, request_summary text, customer_first_name text, service_suburb text)
language sql
stable
security definer
set search_path=''
as $$
  select b.id,
         coalesce(s.name, c.name, 'Service') as service_label,
         left(r.description, 140) as request_summary,
         nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '') as customer_first_name,
         r.suburb as service_suburb
  from public.bookings b
  left join public.service_requests r on r.id = b.request_id
  left join public.services s on s.id = r.service_id
  left join public.categories c on c.id = r.category_id
  left join public.profiles p on p.id = r.customer_id
  where b.id = p_booking_id
    and public.can_operate_business_booking(b.id);
$$;

revoke all on function public.get_business_job_summary(uuid) from public, anon;
grant execute on function public.get_business_job_summary(uuid) to authenticated;

-- Review checklist before applying:
--  [ ] confirm column names (profiles.full_name, service_requests.suburb) against the live schema
--  [ ] confirm can_operate_business_booking covers exactly the people who may see the job
--  [ ] decide whether customer_first_name is acceptable under the privacy policy for assigned crew
--  [ ] add a migration test asserting the revoke/grant and the authorisation predicate
--  [ ] for list screens, add a batched variant taking uuid[] (same predicate per row) to avoid N calls
