-- Trigger helpers are internal-only; revoke RPC execution while keeping trigger execution intact.
revoke all on function public.enforce_business_dm_faq_limit() from public,anon,authenticated;
revoke all on function public.reply_to_business_dm_faq() from public,anon,authenticated;
