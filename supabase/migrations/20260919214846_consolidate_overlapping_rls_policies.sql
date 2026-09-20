-- Reduce redundant permissive RLS policy evaluation without changing authorization semantics.
-- Business write policies previously used ALL, which overlapped public SELECT policies.

DROP POLICY IF EXISTS products_business_write ON public.products;
CREATE POLICY products_business_insert ON public.products FOR INSERT TO public
  WITH CHECK (is_business_member(business_id) OR is_admin());
CREATE POLICY products_business_update ON public.products FOR UPDATE TO public
  USING (is_business_member(business_id) OR is_admin())
  WITH CHECK (is_business_member(business_id) OR is_admin());
CREATE POLICY products_business_delete ON public.products FOR DELETE TO public
  USING (is_business_member(business_id) OR is_admin());

DROP POLICY IF EXISTS services_business_write ON public.services;
CREATE POLICY services_business_insert ON public.services FOR INSERT TO public
  WITH CHECK (is_business_member(business_id) OR is_admin());
CREATE POLICY services_business_update ON public.services FOR UPDATE TO public
  USING (is_business_member(business_id) OR is_admin())
  WITH CHECK (is_business_member(business_id) OR is_admin());
CREATE POLICY services_business_delete ON public.services FOR DELETE TO public
  USING (is_business_member(business_id) OR is_admin());

DROP POLICY IF EXISTS areas_business_write ON public.service_areas;
CREATE POLICY areas_business_insert ON public.service_areas FOR INSERT TO public
  WITH CHECK (is_business_member(business_id) OR is_admin());
CREATE POLICY areas_business_update ON public.service_areas FOR UPDATE TO public
  USING (is_business_member(business_id) OR is_admin())
  WITH CHECK (is_business_member(business_id) OR is_admin());
CREATE POLICY areas_business_delete ON public.service_areas FOR DELETE TO public
  USING (is_business_member(business_id) OR is_admin());

DROP POLICY IF EXISTS delivery_zones_admin_write ON public.delivery_zones;
CREATE POLICY delivery_zones_admin_insert ON public.delivery_zones FOR INSERT TO public
  WITH CHECK (is_admin());
CREATE POLICY delivery_zones_admin_update ON public.delivery_zones FOR UPDATE TO public
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY delivery_zones_admin_delete ON public.delivery_zones FOR DELETE TO public
  USING (is_admin());

DROP POLICY IF EXISTS delivery_admin_write ON public.deliveries;
CREATE POLICY delivery_admin_insert ON public.deliveries FOR INSERT TO public
  WITH CHECK (is_admin());
CREATE POLICY delivery_admin_update ON public.deliveries FOR UPDATE TO public
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY delivery_admin_delete ON public.deliveries FOR DELETE TO public
  USING (is_admin());

DROP POLICY IF EXISTS driver_applications_admin_update ON public.driver_applications;
DROP POLICY IF EXISTS driver_applications_owner_update ON public.driver_applications;
CREATE POLICY driver_applications_update ON public.driver_applications FOR UPDATE TO authenticated
  USING (is_admin() OR (user_id = (SELECT auth.uid()) AND status = 'REJECTED'::text))
  WITH CHECK (is_admin() OR user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS service_payments_business_read ON public.service_payments;
DROP POLICY IF EXISTS service_payments_customer_read ON public.service_payments;
CREATE POLICY service_payments_read ON public.service_payments FOR SELECT TO public
  USING (
    customer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = service_payments.booking_id
        AND is_business_member(b.business_id)
    )
    OR is_admin()
  );
