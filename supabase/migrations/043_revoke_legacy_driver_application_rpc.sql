-- The original driver application RPC predates the production verification workflow.
-- Keep the function for migration compatibility, but remove its client execution path.
revoke execute on function public.create_driver_application(text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;