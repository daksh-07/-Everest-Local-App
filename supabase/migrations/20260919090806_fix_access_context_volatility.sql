create or replace function public.get_my_access_context()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid(); profile_role public.app_role; business_id uuid; business_name text; business_status public.business_status; business_verification public.verification_status; driver_status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform public.refresh_driver_verification_status(uid);
  select role into profile_role from public.profiles where id=uid;
  select b.id,b.name,b.status,b.verification_status into business_id,business_name,business_status,business_verification from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.user_id=uid and bm.member_role='OWNER' order by b.created_at desc limit 1;
  select status into driver_status from public.driver_applications where user_id=uid;
  return jsonb_build_object('profile_role',profile_role,'business_id',business_id,'business_name',business_name,'business_status',business_status,'business_verification_status',business_verification,'driver_application_status',driver_status,'is_business_member',exists(select 1 from public.business_members where user_id=uid),'is_verified_business',coalesce(business_verification='VERIFIED',false),'is_active_driver',public.driver_is_operational(uid),'is_admin',coalesce(profile_role='ADMIN',false));
end;
$$;
revoke execute on function public.get_my_access_context() from public,anon;
grant execute on function public.get_my_access_context() to authenticated;