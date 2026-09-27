-- Legacy direct verification submission bypasses the government verification path.
-- Keep it available only to trusted server-side migration/maintenance callers.
revoke execute on function public.submit_business_verification(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_business_verification(uuid,text,jsonb)
  to service_role;
