-- Preserve an explicit application-status assertion in the operational gate.
-- This is additive to the credential/document compliance evaluation.

create or replace function public.driver_is_operational(p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path=public
as $$
declare result jsonb; a public.driver_applications;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  select * into a from public.driver_applications where user_id=p_user_id;
  if a.id is null then return false; end if;
  if a.status<>'APPROVED' then return false; end if;
  result:=public.evaluate_driver_compliance(a.id);
  return coalesce(result->'overall'->>'status'='APPROVED',false)
    and jsonb_array_length(result->'overall'->'blockingItems')=0;
end;
$$;
revoke execute on function public.driver_is_operational(uuid) from public,anon;
grant execute on function public.driver_is_operational(uuid) to authenticated;
