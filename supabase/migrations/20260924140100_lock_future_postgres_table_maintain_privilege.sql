-- PostgreSQL 17 adds MAINTAIN as a table privilege. Browser/mobile Data API roles do not
-- need maintenance authority, so keep future postgres-owned tables least-privileged too.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE MAINTAIN ON TABLES FROM anon, authenticated;
