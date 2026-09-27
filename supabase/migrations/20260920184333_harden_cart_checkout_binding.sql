-- Prevent customers from binding their cart to another customer's checkout order.
-- Checkout later trusts carts.active_checkout_order_id when reusing an in-flight order,
-- so this relationship must be ownership-constrained at the RLS boundary.

DROP POLICY IF EXISTS carts_owner ON public.carts;

CREATE POLICY carts_owner
ON public.carts
FOR ALL
TO public
USING (
  customer_id = (SELECT auth.uid())
  OR public.is_admin()
)
WITH CHECK (
  public.is_admin()
  OR (
    customer_id = (SELECT auth.uid())
    AND (
      active_checkout_order_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = active_checkout_order_id
          AND o.customer_id = (SELECT auth.uid())
      )
    )
  )
);
