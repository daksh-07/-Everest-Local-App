create policy service_dispatch_config_no_client_access on public.service_dispatch_config for select to authenticated using (false);
create policy service_dispatch_evaluations_no_client_access on public.service_dispatch_evaluations for select to authenticated using (false);
