-- Restore the Data API grants required by the existing RLS policy model.
-- RLS remains the row-level authorization layer; these grants only make the
-- already-defined policies reachable through Supabase PostgREST.
--
-- Supabase's 2026 explicit Data API grant model does not automatically expose
-- tables created by migrations, so the client roles need explicit grants.

-- Signed-out discovery reads.
grant select on public.businesses to anon;
grant select on public.categories to anon;
grant select on public.services to anon;
grant select on public.service_areas to anon;
grant select on public.products to anon;
grant select on public.product_images to anon;
grant select on public.reviews to anon;
grant select on public.delivery_zones to anon;

-- Signed-in reads used across the customer/business/driver application.
grant select on public.profiles to authenticated;
grant select on public.businesses to authenticated;
grant select on public.business_members to authenticated;
grant select on public.categories to authenticated;
grant select on public.services to authenticated;
grant select on public.service_areas to authenticated;
grant select on public.service_requests to authenticated;
grant select on public.service_matches to authenticated;
grant select on public.opportunities to authenticated;
grant select on public.quotes to authenticated;
grant select on public.bookings to authenticated;
grant select on public.products to authenticated;
grant select on public.product_images to authenticated;
grant select on public.inventory to authenticated;
grant select on public.carts to authenticated;
grant select on public.cart_items to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.payments to authenticated;
grant select on public.payouts to authenticated;
grant select on public.deliveries to authenticated;
grant select on public.delivery_assignments to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.reviews to authenticated;
grant select on public.notifications to authenticated;
grant select on public.saved_businesses to authenticated;
grant select on public.saved_products to authenticated;
grant select on public.business_verifications to authenticated;
grant select on public.admin_actions to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.delivery_zones to authenticated;

-- Direct client writes that are part of the existing RLS design.
grant insert, update on public.businesses to authenticated;
grant insert on public.business_members to authenticated;
grant insert, update, delete on public.carts to authenticated;
grant insert, update, delete on public.cart_items to authenticated;
grant insert on public.messages to authenticated;
grant insert, update, delete on public.saved_businesses to authenticated;
grant insert, update, delete on public.saved_products to authenticated;
grant insert, update, delete on public.delivery_zones to authenticated;

-- Authoritative writes remain RPC/server controlled by the existing hardening
-- migrations and are intentionally not granted here:
-- conversations, service_requests, opportunities, quotes, products, services,
-- service_areas, business_verifications, reviews, deliveries, payments, payouts,
-- orders/bookings and notification state.

-- Keep the webhook event ledger server-only.
revoke all on public.stripe_events from anon, authenticated;
