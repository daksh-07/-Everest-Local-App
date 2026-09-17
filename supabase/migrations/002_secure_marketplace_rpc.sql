-- Trusted transactional operations. These functions derive the caller from auth.uid().

create or replace function public.create_service_request(
  p_category_id uuid, p_service_id uuid, p_description text,
  p_suburb text, p_city text, p_state text,
  p_preferred_date date default null, p_preferred_time time default null,
  p_budget numeric default null, p_media_urls text[] default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare request_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_description)) < 5 or length(trim(p_description)) > 5000 then raise exception 'Invalid description'; end if;
 insert into public.service_requests(customer_id,category_id,service_id,description,suburb,city,state,preferred_date,preferred_time,budget,media_urls)
 values(auth.uid(),p_category_id,p_service_id,trim(p_description),trim(p_suburb),trim(p_city),trim(p_state),p_preferred_date,p_preferred_time,p_budget,p_media_urls)
 returning id into request_id;
 perform public.match_service_request(request_id);
 return request_id;
end; $$;

create or replace function public.send_quote(
  p_request_id uuid, p_service_id uuid, p_description text, p_line_items jsonb,
  p_price numeric, p_deposit numeric, p_total numeric,
  p_proposed_date date, p_proposed_time time, p_valid_until timestamptz, p_terms text
) returns uuid language plpgsql security definer set search_path=public as $$
declare qid uuid; bid uuid; cid uuid;
begin
 select o.business_id, r.customer_id into bid,cid from public.opportunities o join public.service_requests r on r.id=o.request_id
 where o.request_id=p_request_id and o.business_id in (select business_id from public.business_members where user_id=auth.uid()) and o.status='OPEN' limit 1;
 if bid is null then raise exception 'No authorized opportunity'; end if;
 if p_price < 0 or p_deposit < 0 or p_total < 0 or p_total < p_deposit then raise exception 'Invalid quote amounts'; end if;
 insert into public.quotes(request_id,business_id,customer_id,service_id,description,line_items,price,deposit,total,proposed_date,proposed_time,valid_until,terms,status)
 values(p_request_id,bid,cid,p_service_id,trim(p_description),coalesce(p_line_items,'[]'::jsonb),p_price,p_deposit,p_total,p_proposed_date,p_proposed_time,p_valid_until,p_terms,'SENT') returning id into qid;
 update public.opportunities set status='RESPONDED' where request_id=p_request_id and business_id=bid;
 insert into public.notifications(user_id,kind,title,body,data) values(cid,'NEW_QUOTE','New quote received','A business has sent you a quote.',jsonb_build_object('quote_id',qid,'request_id',p_request_id));
 return qid;
end; $$;

create or replace function public.accept_quote(p_quote_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare q public.quotes; bid uuid;
begin
 select * into q from public.quotes where id=p_quote_id for update;
 if q.id is null or q.customer_id<>auth.uid() then raise exception 'Not authorized'; end if;
 if q.status not in ('SENT','VIEWED') then raise exception 'Quote cannot be accepted in its current state'; end if;
 if q.valid_until is not null and q.valid_until < now() then update public.quotes set status='EXPIRED' where id=q.id; raise exception 'Quote expired'; end if;
 update public.quotes set status='ACCEPTED',updated_at=now() where id=q.id;
 insert into public.bookings(request_id,quote_id,customer_id,business_id,price,scheduled_date,scheduled_time,status)
 values(q.request_id,q.id,q.customer_id,q.business_id,q.total,q.proposed_date,q.proposed_time,case when q.deposit>0 then 'PENDING_PAYMENT' else 'CONFIRMED' end)
 returning id into bid;
 update public.service_requests set status='BOOKED',updated_at=now() where id=q.request_id;
 insert into public.notifications(user_id,kind,title,body,data) values((select owner_id from public.businesses where id=q.business_id),'QUOTE_ACCEPTED','Quote accepted','A customer accepted your quote.',jsonb_build_object('quote_id',q.id,'booking_id',bid));
 return bid;
end; $$;

create or replace function public.update_booking_status(p_booking_id uuid,p_next public.booking_status) returns boolean language plpgsql security definer set search_path=public as $$
declare b public.bookings; allowed boolean := false;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 if not (b.customer_id=auth.uid() or public.is_business_member(b.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
 allowed := (b.status,p_next) in (('REQUESTED','PENDING_PAYMENT'),('REQUESTED','CONFIRMED'),('PENDING_PAYMENT','CONFIRMED'),('CONFIRMED','UPCOMING'),('UPCOMING','IN_PROGRESS'),('IN_PROGRESS','COMPLETED'),('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED'));
 if not allowed and not public.is_admin() then raise exception 'Invalid booking transition'; end if;
 update public.bookings set status=p_next,completed_at=case when p_next='COMPLETED' then now() else completed_at end,updated_at=now() where id=p_booking_id;
 return true;
end; $$;

-- Direct client writes to sensitive lifecycle tables are denied; clients use the controlled functions above.
revoke insert, update, delete on public.service_requests from anon, authenticated;
revoke insert, update, delete on public.service_matches from anon, authenticated;
revoke insert, update, delete on public.opportunities from anon, authenticated;
revoke insert, update, delete on public.quotes from anon, authenticated;
revoke insert, update, delete on public.bookings from anon, authenticated;
revoke execute on function public.match_service_request(uuid) from anon, authenticated;
revoke execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time,timestamptz,text) from anon;
grant execute on function public.create_service_request(uuid,uuid,text,text,text,text,date,time,numeric,text[]) to authenticated;
grant execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time,timestamptz,text) to authenticated;
grant execute on function public.accept_quote(uuid) to authenticated;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;
