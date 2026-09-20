-- The new delivery-mode RPC overloads are authenticated-only.
revoke execute on function public.create_service(uuid,text,text,uuid,numeric,integer,uuid,public.service_delivery_mode) from anon, public;
revoke execute on function public.create_service_request(uuid,uuid,text,text,text,text,date,time,numeric,text[],public.service_delivery_mode) from anon, public;
