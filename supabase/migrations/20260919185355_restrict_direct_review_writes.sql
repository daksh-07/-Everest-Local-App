-- Keep review creation authoritative through create_transaction_review().
-- The Data API should not be able to fabricate a transaction review by choosing
-- arbitrary business/order/booking relationships. The RPC validates ownership,
-- completion state, product membership, and sets verified_transaction=true.

REVOKE INSERT ON public.reviews FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_transaction_review(uuid, uuid, uuid, uuid, integer, text, text[]) TO authenticated;
