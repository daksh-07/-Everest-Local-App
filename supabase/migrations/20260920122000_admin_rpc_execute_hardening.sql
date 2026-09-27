-- Administrative SECURITY DEFINER RPCs must not be callable through the public Data API.
-- Admin operations are intended for trusted server-side execution only.
revoke execute on function public.admin_set_driver_application(uuid, text, text) from public, authenticated;
revoke execute on function public.admin_set_driver_credential_details(uuid, text, date, text, text, text, text, date, text, text, text) from public, authenticated;
revoke execute on function public.admin_set_driver_document_status(uuid, text, text) from public, authenticated;
revoke execute on function public.admin_set_driver_vehicle_verification(uuid, text, date, text, text, date, text, text, text) from public, authenticated;
revoke execute on function public.admin_set_driver_verification(uuid, text, text, text, text, text, text, text, text) from public, authenticated;
revoke execute on function public.admin_set_verification(uuid, public.verification_status, text) from public, authenticated;

grant execute on function public.admin_set_driver_application(uuid, text, text) to service_role;
grant execute on function public.admin_set_driver_credential_details(uuid, text, date, text, text, text, text, date, text, text, text) to service_role;
grant execute on function public.admin_set_driver_document_status(uuid, text, text) to service_role;
grant execute on function public.admin_set_driver_vehicle_verification(uuid, text, date, text, text, date, text, text, text) to service_role;
grant execute on function public.admin_set_driver_verification(uuid, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.admin_set_verification(uuid, public.verification_status, text) to service_role;
