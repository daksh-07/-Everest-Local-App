-- Service payments are readable only to authorized authenticated users.
grant select on public.service_payments to authenticated;
