-- Preserve the existing authenticated admin review path while keeping official API results service-role-only.
grant execute on function public.admin_set_driver_credential_details(uuid,text,date,text,text,text,text,date,text,text,text) to authenticated;
