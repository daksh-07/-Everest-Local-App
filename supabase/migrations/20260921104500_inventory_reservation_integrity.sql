-- Inventory reservation quantities are server-managed by checkout/reservation RPCs.
-- Keep the database invariant explicit so reserved stock can never be negative
-- or exceed physical stock, even if a future write path is introduced.
alter table public.inventory
  add constraint inventory_reserved_quantity_nonnegative
  check (reserved_quantity >= 0),
  add constraint inventory_reserved_quantity_within_stock
  check (reserved_quantity <= stock_quantity);
