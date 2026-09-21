-- Consolidate the redundant admin SELECT policy on business_verifications.
-- verification_participant already grants SELECT to administrators via is_admin(),
-- so the dedicated admin policy adds a second permissive policy evaluation without
-- changing authorization semantics.
DROP POLICY IF EXISTS business_verifications_admin_select ON public.business_verifications;

-- Cover the remaining foreign keys reported by the Supabase performance advisor.
-- These indexes support verification-history joins/deletes and reviewer lookups.
CREATE INDEX IF NOT EXISTS abn_verification_attempts_verification_id_idx
  ON public.abn_verification_attempts (verification_id);

CREATE INDEX IF NOT EXISTS business_verification_reviews_requested_by_idx
  ON public.business_verification_reviews (requested_by);

CREATE INDEX IF NOT EXISTS business_verification_reviews_reviewed_by_idx
  ON public.business_verification_reviews (reviewed_by);

CREATE INDEX IF NOT EXISTS business_verification_reviews_verification_id_idx
  ON public.business_verification_reviews (verification_id);
