-- Allow authenticated business users to write product image metadata.
-- RLS policies still enforce ownership/business membership.
grant insert, update, delete on table public.product_images to authenticated;
