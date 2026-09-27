-- ---------- SECURITY-DEFINER LIFECYCLE HARDENING ----------

create or replace function public.update_booking_status(p_booking_id uuid,p_next public.booking_status)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare b public.bookings; allowed boolean:=false; caller_business boolean:=false;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 caller_business:=public.can_operate_business_booking(b.id);
 if not (b.customer_id=auth.uid() or caller_business or public.is_admin()) then raise exception 'Not authorized'; end if;
 if public.is_admin() then allowed:=true;
 elsif caller_business then allowed:=(b.status,p_next) in (
   ('REQUESTED','PENDING_PAYMENT'),('REQUESTED','CONFIRMED'),('PENDING_PAYMENT','CONFIRMED'),
   ('CONFIRMED','UPCOMING'),('UPCOMING','IN_PROGRESS'),('IN_PROGRESS','COMPLETED'),
   ('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),
   ('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED')
 );
 else allowed:=(b.status,p_next) in (
   ('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),
   ('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED')
 );
 end if;
 if not allowed then raise exception 'Invalid booking transition'; end if;
 update public.bookings set status=p_next,completed_at=case when p_next='COMPLETED' then now() else completed_at end,updated_at=now() where id=p_booking_id;
 return true;
end
$$;
revoke all on function public.update_booking_status(uuid,public.booking_status) from public,anon;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;

create or replace function public.ensure_booking_job_record(p_booking_id uuid)
returns public.booking_job_records
language plpgsql
security definer
set search_path=public
as $$
declare b public.bookings; result public.booking_job_records;
begin
 select * into b from public.bookings where id=p_booking_id;
 if b.id is null then raise exception 'Booking not found'; end if;
 if not (public.can_operate_business_booking(b.id) or public.is_admin()) then raise exception 'Not authorized'; end if;
 insert into public.booking_job_records(booking_id,business_id,customer_id)
 values(b.id,b.business_id,b.customer_id)
 on conflict(booking_id) do nothing;
 select * into result from public.booking_job_records where booking_id=b.id;
 return result;
end
$$;

create or replace function public.set_booking_job_progress(
 p_booking_id uuid,p_arrival_status text,p_arrival_eta timestamptz default null,p_completion_summary text default null
) returns public.booking_job_records
language plpgsql
security definer
set search_path=public
as $$
declare b public.bookings; result public.booking_job_records;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 if not (public.can_operate_business_booking(b.id) or public.is_admin()) then raise exception 'Not authorized'; end if;
 if p_arrival_status not in ('NOT_STARTED','ON_MY_WAY','ARRIVED','IN_PROGRESS','COMPLETED') then raise exception 'Invalid job progress'; end if;
 if p_arrival_status='IN_PROGRESS' and b.status not in ('UPCOMING','IN_PROGRESS') then raise exception 'Booking is not ready to start'; end if;
 if p_arrival_status='COMPLETED' and b.status not in ('IN_PROGRESS','COMPLETED') then raise exception 'Booking is not in progress'; end if;
 insert into public.booking_job_records(booking_id,business_id,customer_id,arrival_status,arrival_eta,completion_summary,started_at,completed_at)
 values(
   b.id,b.business_id,b.customer_id,p_arrival_status,p_arrival_eta,nullif(trim(coalesce(p_completion_summary,'')),''),
   case when p_arrival_status in ('IN_PROGRESS','COMPLETED') then now() end,
   case when p_arrival_status='COMPLETED' then now() end
 )
 on conflict(booking_id) do update set
   arrival_status=excluded.arrival_status,arrival_eta=excluded.arrival_eta,
   completion_summary=coalesce(excluded.completion_summary,booking_job_records.completion_summary),
   started_at=coalesce(booking_job_records.started_at,excluded.started_at),
   completed_at=coalesce(excluded.completed_at,booking_job_records.completed_at),updated_at=now()
 returning * into result;
 return result;
end
$$;

create or replace function public.add_booking_job_checklist_item(p_booking_id uuid,p_label text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare b public.bookings; new_id uuid;
begin
 select * into b from public.bookings where id=p_booking_id;
 if b.id is null then raise exception 'Booking not found'; end if;
 if not (public.can_operate_business_booking(b.id) or public.is_admin()) then raise exception 'Not authorized'; end if;
 if char_length(trim(coalesce(p_label,''))) not between 1 and 160 then raise exception 'Checklist item is required'; end if;
 perform public.ensure_booking_job_record(b.id);
 insert into public.booking_job_checklist_items(booking_id,business_id,label,position)
 select b.id,b.business_id,trim(p_label),coalesce(max(position),-1)+1
 from public.booking_job_checklist_items where booking_id=b.id
 returning id into new_id;
 return new_id;
end
$$;

create or replace function public.set_booking_job_checklist_item(p_item_id uuid,p_is_complete boolean)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare item public.booking_job_checklist_items;
begin
 select * into item from public.booking_job_checklist_items where id=p_item_id for update;
 if item.id is null then raise exception 'Checklist item not found'; end if;
 if not (public.can_operate_business_booking(item.booking_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
 update public.booking_job_checklist_items set
   is_complete=p_is_complete,completed_at=case when p_is_complete then now() else null end,
   completed_by=case when p_is_complete then auth.uid() else null end,updated_at=now()
 where id=item.id;
 return true;
end
$$;

revoke all on function public.ensure_booking_job_record(uuid) from public,anon;
revoke all on function public.set_booking_job_progress(uuid,text,timestamptz,text) from public,anon;
revoke all on function public.add_booking_job_checklist_item(uuid,text) from public,anon;
revoke all on function public.set_booking_job_checklist_item(uuid,boolean) from public,anon;
grant execute on function public.ensure_booking_job_record(uuid) to authenticated;
grant execute on function public.set_booking_job_progress(uuid,text,timestamptz,text) to authenticated;
grant execute on function public.add_booking_job_checklist_item(uuid,text) to authenticated;
grant execute on function public.set_booking_job_checklist_item(uuid,boolean) to authenticated;
