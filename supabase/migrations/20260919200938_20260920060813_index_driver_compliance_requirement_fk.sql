-- Cover the composite foreign key used by compliance checks.
-- The table primary key starts with application_id, so it does not cover
-- lookups/deletes against (jurisdiction_code, requirement_code).
create index if not exists driver_compliance_checks_requirement_fk_idx
  on public.driver_compliance_checks (jurisdiction_code, requirement_code);
