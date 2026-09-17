-- Cart creation must be safe when multiple screens start at the same time.
create or replace function public.get_or_create_cart() returns uuid
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select id into cid from public.carts where customer_id=uid for update;
  if cid is not null then return cid; end if;
  insert into public.carts(customer_id) values(uid) on conflict(customer_id) do update set updated_at=now() returning id into cid;
  return cid;
end; $$;

revoke execute on function public.get_or_create_cart() from anon;
grant execute on function public.get_or_create_cart() to authenticated;
