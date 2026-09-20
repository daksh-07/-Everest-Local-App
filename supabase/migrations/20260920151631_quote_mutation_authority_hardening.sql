-- Quote mutations are authoritative marketplace operations.
-- Clients may read participant quotes, but cannot create, edit, or delete them
-- directly. send_quote() and accept_quote() remain the only supported write paths.
drop policy if exists quotes_business_insert on public.quotes;
drop policy if exists quotes_business_update on public.quotes;

revoke insert, update, delete on table public.quotes from anon, authenticated;

revoke execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) from public, anon, authenticated;
revoke execute on function public.accept_quote(uuid) from public, anon, authenticated;

grant execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) to authenticated;
grant execute on function public.accept_quote(uuid) to authenticated;
