-- Data API clients only need row-level DML explicitly granted for application flows.
-- TRUNCATE bypasses row-level security entirely; TRIGGER and REFERENCES are capabilities
-- that the mobile/web clients never need. Preserve SELECT/INSERT/UPDATE/DELETE grants
-- and service-role access while removing these privileges from every current table.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Prevent migrations that create tables as postgres from reintroducing them.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
