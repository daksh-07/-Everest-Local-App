create unique index if not exists reviews_booking_author_unique on public.reviews(author_id,booking_id) where booking_id is not null;
create unique index if not exists reviews_order_product_author_unique on public.reviews(author_id,order_id,product_id) where order_id is not null and product_id is not null;
create index if not exists orders_customer_created_idx on public.orders(customer_id,created_at desc);
create index if not exists orders_business_created_idx on public.orders(business_id,created_at desc);
create index if not exists bookings_customer_created_idx on public.bookings(customer_id,created_at desc);
create index if not exists bookings_business_created_idx on public.bookings(business_id,created_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at asc);
create index if not exists opportunities_business_status_idx on public.opportunities(business_id,status,created_at desc);
create index if not exists service_requests_customer_created_idx on public.service_requests(customer_id,created_at desc);
