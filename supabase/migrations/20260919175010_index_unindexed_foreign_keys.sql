-- Add covering indexes for frequently joined foreign keys.
-- These indexes preserve existing constraints/RLS semantics and improve joins,
-- parent-row updates/deletes, and participant lookups.

create index if not exists admin_actions_admin_id_idx on public.admin_actions (admin_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists bookings_request_id_idx on public.bookings (request_id);
create index if not exists business_members_user_id_idx on public.business_members (user_id);
create index if not exists business_verifications_business_id_idx on public.business_verifications (business_id);
create index if not exists business_verifications_reviewed_by_idx on public.business_verifications (reviewed_by);
create index if not exists business_verifications_submitted_by_idx on public.business_verifications (submitted_by);
create index if not exists businesses_category_id_idx on public.businesses (category_id);
create index if not exists cart_items_product_id_idx on public.cart_items (product_id);
create index if not exists categories_parent_id_idx on public.categories (parent_id);
create index if not exists conversations_booking_id_idx on public.conversations (booking_id);
create index if not exists conversations_business_id_idx on public.conversations (business_id);
create index if not exists conversations_customer_id_idx on public.conversations (customer_id);
create index if not exists conversations_quote_id_idx on public.conversations (quote_id);
create index if not exists conversations_request_id_idx on public.conversations (request_id);
create index if not exists delivery_assignments_driver_id_idx on public.delivery_assignments (driver_id);
create index if not exists driver_applications_reviewed_by_idx on public.driver_applications (reviewed_by);
create index if not exists driver_compliance_checks_reviewer_id_idx on public.driver_compliance_checks (reviewer_id);
create index if not exists driver_declarations_declaration_key_idx on public.driver_declarations (declaration_key);
create index if not exists driver_declarations_user_id_idx on public.driver_declarations (user_id);
create index if not exists driver_documents_supersedes_document_id_idx on public.driver_documents (supersedes_document_id);
create index if not exists driver_documents_vehicle_id_idx on public.driver_documents (vehicle_id);
create index if not exists driver_documents_verified_by_idx on public.driver_documents (verified_by);
create index if not exists driver_status_history_actor_id_idx on public.driver_status_history (actor_id);
create index if not exists driver_vehicles_user_id_idx on public.driver_vehicles (user_id);
create index if not exists driver_vehicles_verified_by_idx on public.driver_vehicles (verified_by);
create index if not exists driver_verifications_identity_verified_by_idx on public.driver_verifications (identity_verified_by);
create index if not exists driver_verifications_insurance_verified_by_idx on public.driver_verifications (insurance_verified_by);
create index if not exists driver_verifications_licence_verified_by_idx on public.driver_verifications (licence_verified_by);
create index if not exists driver_verifications_registration_verified_by_idx on public.driver_verifications (registration_verified_by);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists payments_booking_id_idx on public.payments (booking_id);
create index if not exists payments_customer_id_idx on public.payments (customer_id);
create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payouts_business_id_idx on public.payouts (business_id);
create index if not exists payouts_payment_id_idx on public.payouts (payment_id);
create index if not exists product_images_product_id_idx on public.product_images (product_id);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists quotes_service_id_idx on public.quotes (service_id);
create index if not exists reviews_booking_id_idx on public.reviews (booking_id);
create index if not exists reviews_business_id_idx on public.reviews (business_id);
create index if not exists reviews_order_id_idx on public.reviews (order_id);
create index if not exists reviews_product_id_idx on public.reviews (product_id);
create index if not exists saved_businesses_business_id_idx on public.saved_businesses (business_id);
create index if not exists saved_products_product_id_idx on public.saved_products (product_id);
create index if not exists service_payments_quote_id_idx on public.service_payments (quote_id);
create index if not exists service_requests_service_id_idx on public.service_requests (service_id);
create index if not exists services_category_id_idx on public.services (category_id);

-- This partial index duplicates the protection already provided by the
-- non-partial unique (author_id, booking_id) index on reviews.
drop index if exists public.reviews_booking_author_unique;
