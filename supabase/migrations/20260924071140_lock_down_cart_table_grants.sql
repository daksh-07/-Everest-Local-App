revoke all on table public.carts from anon;
revoke all on table public.cart_items from anon;
revoke all on table public.carts from authenticated;
revoke all on table public.cart_items from authenticated;
grant select on table public.carts to authenticated;
grant select on table public.cart_items to authenticated;
