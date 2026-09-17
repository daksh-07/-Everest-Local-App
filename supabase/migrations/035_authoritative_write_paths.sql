-- Keep authoritative marketplace state behind the validated RPCs.
-- SECURITY DEFINER RPCs bypass table RLS, so these revokes do not block the
-- application flows; they prevent direct REST writes from bypassing workflow
-- validation and ownership checks.
revoke insert, update, delete on public.quotes from anon, authenticated;
revoke insert on public.reviews from anon, authenticated;
revoke insert, update, delete on public.service_requests from anon, authenticated;
revoke insert, update, delete on public.products from anon, authenticated;
revoke insert, update, delete on public.services from anon, authenticated;
revoke insert, update, delete on public.service_areas from anon, authenticated;
revoke insert, update, delete on public.business_verifications from anon, authenticated;
revoke insert, update, delete on public.opportunities from anon, authenticated;
revoke insert, update, delete on public.deliveries from anon, authenticated;
