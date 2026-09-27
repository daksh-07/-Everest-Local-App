create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
