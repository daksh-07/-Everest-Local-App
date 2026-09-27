-- Enforce core commerce pricing invariants at the database boundary.
-- Product mutation RPCs already validate these rules; these constraints also
-- protect against accidental future direct writes or privileged maintenance.

ALTER TABLE public.products
  ADD CONSTRAINT products_sale_price_not_above_price
  CHECK (sale_price IS NULL OR sale_price <= price);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_line_total_matches_quantity_price
  CHECK (line_total = round(unit_price * quantity, 2));
