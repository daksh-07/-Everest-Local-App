-- Service-role helper for trusted Edge Functions that must re-check a user's
-- current business permission after an external OAuth redirect, where auth.uid()
-- is not available from the callback request.

create or replace function public.user_has_business_permission(
  p_user_id uuid,
  p_business_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (
      select o.allowed
      from public.business_member_permission_overrides o
      where o.business_id=p_business_id
        and o.user_id=p_user_id
        and o.permission=upper(p_permission)
    ),
    (
      select public.business_role_has_permission(bm.member_role,upper(p_permission))
      from public.business_members bm
      where bm.business_id=p_business_id
        and bm.user_id=p_user_id
        and bm.status='ACTIVE'
    ),
    false
  )
$$;

revoke all on function public.user_has_business_permission(uuid,uuid,text)
from public,anon,authenticated;
grant execute on function public.user_has_business_permission(uuid,uuid,text)
to service_role;
