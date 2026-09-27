revoke execute on function public.request_business_verification_review(uuid,text,text) from public, anon;
grant execute on function public.request_business_verification_review(uuid,text,text) to authenticated;

revoke execute on function public.resolve_business_verification_review(uuid,text,text) from public, anon;
grant execute on function public.resolve_business_verification_review(uuid,text,text) to authenticated;
