-- Pin every SECURITY DEFINER function in public to a deterministic search_path.
-- This preserves existing server-authoritative RPC behavior while preventing
-- session-level search_path manipulation from changing object resolution.
ALTER FUNCTION public.admin_set_verification(uuid, public.verification_status, text) SET search_path TO public;
ALTER FUNCTION public.follow_business(uuid) SET search_path TO public;
ALTER FUNCTION public.follow_user(uuid) SET search_path TO public;
ALTER FUNCTION public.get_follow_counts(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.guard_business_security_fields() SET search_path TO public;
ALTER FUNCTION public.is_following(uuid, uuid) SET search_path TO public;
ALTER FUNCTION public.submit_business_verification(uuid, text, jsonb) SET search_path TO public;
ALTER FUNCTION public.submit_business_verification_from_abr(uuid, uuid, text, text, text, text, text, text, date, timestamptz, date, boolean, text) SET search_path TO public;
ALTER FUNCTION public.sync_public_profile() SET search_path TO public;
ALTER FUNCTION public.unfollow_business(uuid) SET search_path TO public;
ALTER FUNCTION public.unfollow_user(uuid) SET search_path TO public;
