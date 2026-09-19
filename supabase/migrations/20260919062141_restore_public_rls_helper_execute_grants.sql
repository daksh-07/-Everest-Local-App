-- Public discovery RLS policies also call these helpers; anon needs EXECUTE
-- so those policies can evaluate to false safely for signed-out visitors.
grant execute on function public.is_admin() to anon;
grant execute on function public.is_business_member(uuid) to anon;
