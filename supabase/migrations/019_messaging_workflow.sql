-- Complete the existing marketplace messaging path without exposing arbitrary conversations.
-- Conversation creation is authorized against the underlying request/quote/booking relationship.

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
    where q.id=p_quote_id and q.request_id=p_request_id and q.business_id=p_business_id and q.customer_id=v_customer
  ) then
    raise exception 'Quote does not belong to this conversation';
  end if;

  if p_booking_id is not null and not exists (
    select 1 from public.bookings b
    where b.id=p_booking_id and b.request_id=p_request_id and b.business_id=p_business_id and b.customer_id=v_customer
  ) then
    raise exception 'Booking does not belong to this conversation';
  end if;

  select id into v_conversation
  from public.conversations
  where customer_id=v_customer and business_id=p_business_id and request_id=p_request_id
  order by created_at asc
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

-- Read receipts are server-authorized because client UPDATE on messages is intentionally revoked.
create or replace function public.mark_message_read(p_message_id uuid) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.messages m
  set read_at=coalesce(read_at,now())
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
