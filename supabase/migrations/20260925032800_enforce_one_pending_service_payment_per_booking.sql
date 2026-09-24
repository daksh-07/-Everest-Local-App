create unique index if not exists service_payments_one_pending_per_booking_idx on public.service_payments (booking_id) where status = 'PENDING';
