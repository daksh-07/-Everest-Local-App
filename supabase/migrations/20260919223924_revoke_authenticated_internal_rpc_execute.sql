-- Remove Data API execution access from internal webhook/trigger/maintenance functions.
-- Stripe processing is invoked only by the signed stripe-webhook Edge Function
-- using the service role. Trigger functions are invoked by PostgreSQL triggers,
-- and the maintenance function is invoked by the scheduled database job.

revoke execute on function public.claim_stripe_event(text, text) from anon, authenticated;
revoke execute on function public.finish_stripe_event(text, boolean) from anon, authenticated;
revoke execute on function public.process_stripe_order_success(uuid) from anon, authenticated;
revoke execute on function public.process_stripe_order_failure(uuid) from anon, authenticated;
revoke execute on function public.process_stripe_service_success(uuid) from anon, authenticated;
revoke execute on function public.process_stripe_service_failure(uuid) from anon, authenticated;
revoke execute on function public.driver_verification_maintenance() from anon, authenticated;

-- These functions are trigger-only and should not be callable through /rest/v1/rpc.
revoke execute on function public.guard_business_security_fields() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.notify_booking_change() from anon, authenticated;
revoke execute on function public.notify_delivery_change() from anon, authenticated;
revoke execute on function public.notify_opportunity_insert() from anon, authenticated;
revoke execute on function public.notify_order_change() from anon, authenticated;
revoke execute on function public.notify_quote_change() from anon, authenticated;
