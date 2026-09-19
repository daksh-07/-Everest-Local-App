-- RLS policies call these SECURITY DEFINER authorization helpers.
-- They are not exposed as application RPCs, but authenticated requests still
-- need EXECUTE privilege to evaluate the policies that invoke them.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
