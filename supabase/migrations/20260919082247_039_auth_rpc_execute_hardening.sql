-- Remove implicit PUBLIC execution from the new privileged authentication RPCs.
revoke execute on function public.create_driver_application(text,text,text,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.admin_set_driver_application(uuid,text,text) from public, anon;
revoke execute on function public.get_my_access_context() from public, anon;
revoke execute on function public.create_business_profile(text,text,uuid,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.admin_set_verification(uuid,public.verification_status,text) from public, anon;
grant execute on function public.create_driver_application(text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_driver_application(uuid,text,text) to authenticated;
grant execute on function public.get_my_access_context() to authenticated;
grant execute on function public.create_business_profile(text,text,uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_verification(uuid,public.verification_status,text) to authenticated;
