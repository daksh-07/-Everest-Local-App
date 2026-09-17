-- Harden messaging conversation creation against concurrent requests and direct table writes.
-- The client must use get_or_create_conversation so participant/request relationships stay authoritative.

revoke insert, update, delete on public.conversations from anon, authenticated;

create or replace function public.get_or_create_conversation(
  p_request_id uuid,
  p_business_id uuid,
  p_quote_id uuid default null,
  p_booking_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_customer uuid;
  v_conversation uuid;
  v_lock_key bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_request_id is null or p_business_id is null then raise exception 'Request and business are required'; end if;

  select customer_id into v_customer
  from public.service_requests
  where id=p_request_id;
  if v_customer is null then raise exception 'Request not found'; end if;

  if not (v_user=v_customer or public.is_business_member(p_business_id) or public.is_admin()) then
    raise exception 'Not authorized for this conversation';
  end if;

  if not exists (
    select 1 from public.opportunities o
    where o.request_id=p_request_id and o.business_id=p_business_id
  ) and not exists (
    select 1 from public.quotes q
    where q.request_id=p_request_id and q.business_id=p_business_id
  ) and not exists (
    select 1 from public.bookings b
    where b.request_id=p_request_id and b.business_id=p_business_id
  ) then
    raise exception 'Business is not associated with this request';
  end if;

  if p_quote_id is not null and not exists (
    select 1 from public.quotes q
    where q.id=p_quote_id
      and q.request_id=p_request_id
      and q.business_id=p_business_id
      and q.customer_id=v_customer
  ) then
    raise exception 'Quote does not belong to this conversation';
  end if;

  if p_booking_id is not null and not exists (
    select 1 from public.bookings b
    where b.id=p_booking_id
      and b.request_id=p_request_id
      and b.business_id=p_business_id
      and b.customer_id=v_customer
  ) then
    raise exception 'Booking does not belong to this conversation';
  end if;

  -- Serialize creation for the same customer/business/request without relying on
  -- client-generated IDs or a potentially destructive cleanup of existing data.
  v_lock_key := hashtextextended(v_customer::text || ':' || p_business_id::text || ':' || p_request_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select id into v_conversation
  from public.conversations
  where customer_id=v_customer
    and business_id=p_business_id
    and request_id=p_request_id
  order by created_at asc, id asc
  limit 1;

  if v_conversation is null then
    insert into public.conversations(customer_id,business_id,request_id,quote_id,booking_id)
    values(v_customer,p_business_id,p_request_id,p_quote_id,p_booking_id)
    returning id into v_conversation;
  end if;

  return v_conversation;
end;
$$;

revoke execute on function public.get_or_create_conversation(uuid,uuid,uuid,uuid) from anon;
grant execute on function public.get_or_create_conversation(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.mark_message_read(p_message_id uuid) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.messages m
  set read_at=coalesce(m.read_at,now())
  from public.conversations c
  where m.id=p_message_id
    and m.conversation_id=c.id
    and (c.customer_id=auth.uid() or public.is_business_member(c.business_id) or public.is_admin())
    and m.sender_id<>auth.uid();
  return found;
end;
$$;

revoke execute on function public.mark_message_read(uuid) from anon;
grant execute on function public.mark_message_read(uuid) to authenticated;
