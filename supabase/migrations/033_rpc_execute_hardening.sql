-- SECURITY DEFINER functions are powerful by design. Expose only the authenticated
-- application RPC surface; trigger/internal/payment-processing helpers are server-only.
do $$
declare
  r record;
begin
  for r in
    select p.oid, n.nspname as schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from anon, authenticated',
      r.schema_name, r.proname, r.identity_args
    );
  end loop;
end $$;

-- These are the existing mobile/server RPC entry points that authenticated users
-- are allowed to invoke. Each function retains its own authorization checks.
grant execute on function public.accept_quote(uuid) to authenticated;
grant execute on function public.add_service_area(uuid,text,text,text,text) to authenticated;
grant execute on function public.adjust_inventory(uuid,integer) to authenticated;
grant execute on function public.assign_delivery_driver(uuid,uuid) to authenticated;
grant execute on function public.can_delete_my_account() to authenticated;
grant execute on function public.create_business_profile(text,text,uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_delivery_for_order(uuid) to authenticated;
grant execute on function public.create_order_from_cart(text,text,jsonb) to authenticated;
grant execute on function public.create_product(uuid,text,text,uuid,numeric,numeric,text,boolean,boolean,integer) to authenticated;
grant execute on function public.create_service(uuid,text,text,uuid,numeric,integer) to authenticated;
grant execute on function public.create_service_payment(uuid,text) to authenticated;
grant execute on function public.create_service_request(uuid,uuid,text,text,text,text,date,time,numeric,text[]) to authenticated;
grant execute on function public.create_transaction_review(uuid,uuid,uuid,uuid,integer,text,text[]) to authenticated;
grant execute on function public.get_or_create_cart() to authenticated;
grant execute on function public.get_or_create_conversation(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.match_service_request(uuid) to authenticated;
grant execute on function public.release_my_order_reservations(uuid) to authenticated;
grant execute on function public.request_delivery_for_order(uuid) to authenticated;
grant execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time,timestamptz,text) to authenticated;
grant execute on function public.set_product_status(uuid,public.product_status) to authenticated;
grant execute on function public.set_service_status(uuid,boolean) to authenticated;
grant execute on function public.submit_business_verification(uuid,text,jsonb) to authenticated;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;
grant execute on function public.update_my_profile(text,text,text,text,text) to authenticated;
grant execute on function public.update_order_status(uuid,public.order_status) to authenticated;
grant execute on function public.update_product(uuid,text,text,uuid,numeric,numeric,text,boolean,boolean) to authenticated;

-- Stripe event claiming/processing is only performed by the trusted webhook function.
revoke all on public.stripe_events from anon, authenticated;
