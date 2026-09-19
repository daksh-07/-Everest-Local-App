create unique index if not exists quotes_one_accepted_per_request_idx
  on public.quotes(request_id)
  where status='ACCEPTED';

create or replace function public.accept_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q public.quotes;
  r public.service_requests;
  bid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into q from public.quotes where id=p_quote_id for update;
  if q.id is null or q.customer_id<>auth.uid() then raise exception 'Not authorized'; end if;

  select * into r from public.service_requests where id=q.request_id for update;
  if r.id is null or r.customer_id<>auth.uid() then raise exception 'Request not found'; end if;
  if r.status<>'QUOTING' then raise exception 'This request is no longer accepting quote decisions'; end if;
  if q.status not in ('SENT','VIEWED') then raise exception 'Quote cannot be accepted in its current state'; end if;
  if q.valid_until is not null and q.valid_until < now() then
    update public.quotes set status='EXPIRED',updated_at=now() where id=q.id;
    raise exception 'Quote expired';
  end if;

  update public.quotes set status='ACCEPTED',updated_at=now() where id=q.id;
  update public.quotes
    set status='DECLINED',updated_at=now()
    where request_id=q.request_id and id<>q.id and status in ('SENT','VIEWED');

  insert into public.bookings(
    request_id,quote_id,customer_id,business_id,price,scheduled_date,scheduled_time,status
  )
  values(
    q.request_id,q.id,q.customer_id,q.business_id,q.total,q.proposed_date,q.proposed_time,
    case when q.deposit>0 then 'PENDING_PAYMENT' else 'CONFIRMED' end
  )
  returning id into bid;

  update public.service_requests set status='BOOKED',updated_at=now() where id=q.request_id;
  insert into public.notifications(user_id,kind,title,body,data)
  values(
    (select owner_id from public.businesses where id=q.business_id),
    'QUOTE_ACCEPTED',
    'Quote accepted',
    'A customer accepted your quote.',
    jsonb_build_object('quote_id',q.id,'booking_id',bid)
  );
  return bid;
end;
$function$;
