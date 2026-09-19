-- Remove redundant duplicate indexes identified by the Supabase performance advisor.
-- Keep the constraint-backed service_areas unique index; only drop the standalone duplicate.
DROP INDEX IF EXISTS public.messages_conversation_idx;
DROP INDEX IF EXISTS public.opportunities_business_idx;
DROP INDEX IF EXISTS public.orders_customer_idx;
DROP INDEX IF EXISTS public.service_areas_business_location_unique;
DROP INDEX IF EXISTS public.requests_customer_idx;
