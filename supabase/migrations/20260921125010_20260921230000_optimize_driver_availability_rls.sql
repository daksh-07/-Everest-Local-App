-- Keep driver availability ownership unchanged while allowing PostgreSQL to evaluate auth.uid() once per statement.
drop policy if exists driver_availability_select_own on public.driver_availability;
create policy driver_availability_select_own on public.driver_availability
  for select to authenticated
  using (driver_id = (select auth.uid()));
