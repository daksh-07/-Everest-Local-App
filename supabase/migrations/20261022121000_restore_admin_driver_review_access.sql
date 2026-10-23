-- Everest Local: make the in-app driver review and driver compliance status work again.
--
-- 20260920221900_admin_rpc_execute_hardening made every admin_* RPC service-role
-- only. Business verification (admin_set_verification) and
-- admin_set_driver_credential_details were later re-granted once is_admin()
-- began requiring a password session plus AAL2 MFA, but the remaining driver
-- review RPCs were not, so every action on /driver-verification failed.
--
-- 20260920002739_restrict_internal_driver_rpc_execution also revoked
-- evaluate_driver_compliance, which /driver-verification needs to load at all
-- and which driver onboarding uses to show a driver what is still blocking them.
-- The function already raises unless the caller owns the application or
-- is_admin() is true, and its only write is an idempotent insert of checklist rows.
--
-- Every function below raises 'Admin authorization required' (or 'Not authorized')
-- before touching data unless the server-side checks pass.
grant execute on function public.admin_set_driver_application(uuid, text, text) to authenticated;
-- Keep the unused legacy all-in-one verifier service-only. The current UI uses
-- the credential/vehicle APIs, whose expiry and compliance checks are stricter.
grant execute on function public.admin_set_driver_document_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_driver_vehicle_verification(uuid, text, date, text, text, date, text, text, text) to authenticated;
grant execute on function public.evaluate_driver_compliance(uuid) to authenticated;
