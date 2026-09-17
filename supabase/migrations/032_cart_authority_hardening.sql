-- Cart ownership is sufficient for item writes; authoritative cart creation and checkout claims stay server-controlled.
revoke insert,update,delete on public.carts from anon,authenticated;
