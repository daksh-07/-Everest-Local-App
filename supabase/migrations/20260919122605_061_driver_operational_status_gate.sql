-- Keep the explicit APPROVED application state in the operational security boundary.
-- Compliance evaluation remains the credential/document gate.

create or replace function public.driver_is_operational(p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path=public
as $$
declare result jsonb; aid uuid; app_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  select id,status into aid,app_status from public.driver_applications where user_id=p_user_id;
  if aid is null then return false; end if;
  if app_status='SUSPENDED' then return false; end if;
  if app_status<>'APPROVED' then return false; end if;
  result:=public.evaluate_driver_compliance(aid);
  return coalesce(result->'overall'->>'status'='APPROVED',false)
    and jsonb_array_length(result->'overall'->'blockingItems')=0;
end;
$$;
revoke execute on function public.driver_is_operational(uuid) from public,anon;
grant execute on function public.driver_is_operational(uuid) to authenticated;
