-- Trigger-only retention helpers must never be exposed as Data API RPCs.
revoke all on function public.retention_product_saved_search_trigger() from public,anon,authenticated;
revoke all on function public.retention_available_now_saved_search_trigger() from public,anon,authenticated;
