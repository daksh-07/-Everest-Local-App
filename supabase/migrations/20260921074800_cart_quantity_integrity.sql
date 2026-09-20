-- Keep cart state internally consistent. Checkout remains the authoritative
-- source for stock, pricing, and fulfilment validation.
alter table public.cart_items
  add constraint cart_items_quantity_positive check (quantity > 0);
