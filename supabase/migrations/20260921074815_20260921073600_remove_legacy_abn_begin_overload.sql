drop function if exists public.begin_automated_abn_verification(uuid,uuid,text);

revoke all on function public.begin_automated_abn_verification(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.begin_automated_abn_verification(uuid,uuid,text,boolean) to service_role;
